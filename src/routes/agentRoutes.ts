import { Wallet } from 'ethers';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contractClient, supabase } from '../config';
import { signatureVerificationPlugin } from '../middleware/signatureVerification';
import { WsMessageTypes } from '../schemas/wsServer';
import { Database, Tables } from '../types/database.types';
import { getOrCreateUser } from '../utils/userManagement';

// Schema for signed agent creation request
export const signedAgentCreationSchema = z.object({
  messageType: z.literal(WsMessageTypes.CREATE_AGENT),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    timestamp: z.number(),
    display_name: z.string(),
    endpoint: z.string(),
    platform: z.string(),
    color: z.string(),
    type: z.string().default('basic'),
    character_card: z.string().nullable(),
    image_url: z.string().nullable(),
    single_sentence_summary: z.string().nullable(),
  }),
});

export async function agentRoutes(server: FastifyInstance) {
  // Create new agent
  server.post<{
    Body: z.infer<typeof signedAgentCreationSchema>;
    Reply: { data?: Tables<'agents'>; error?: string };
  }>(
    '',
    {
      preHandler: signatureVerificationPlugin,
    },
    async (request, reply) => {
      try {
        const signer = request.verifiedAddress;

        // 2. Get or create user for the verified address
        const user = await getOrCreateUser(signer);

        // 3. Create agent wallet
        const agentWallet = Wallet.createRandom();

        // 4. Create agent in database first to get ID
        const { data: agent, error: dbError } = await supabase
          .from('agents')
          .insert({
            earnings: 0,
            type: request.body.content.type || 'basic',
            image_url: request.body.content.image_url || '',
            character_card: request.body.content.character_card || '',
            single_sentence_summary: request.body.content.single_sentence_summary || '',
            color: request.body.content.color || Math.floor(Math.random() * 16777215).toString(16),
            platform: request.body.content.platform || '',
            display_name: request.body.content.display_name || '',
            endpoint: request.body.content.endpoint || '',
            creator_id: user.id,
            eth_wallet_address: agentWallet.address,
            uuid: crypto.randomUUID(),
            status: 'Pending',
          } satisfies Database['public']['Tables']['agents']['Insert'])
          .select()
          .single();

        if (dbError) {
          throw new Error(`Database error creating agent: ${dbError.message}`);
        }

        console.log('creating agent on contract with creator:', signer, 'and agentId:', agent.id);
        const contractAgent = await contractClient.createAgent({
          creator: signer as `0x${string}`,
          agentId: BigInt(agent.id),
        });
        console.log('created agent on contract', contractAgent);

        // 6. Register agent's wallet
        const contractRegisterAgentWallet = await contractClient.registerAgentWallet({
          agentId: BigInt(agent.id),
          altWallet: agentWallet.address as `0x${string}`,
        });
        console.log(
          'registered agent application level wallet on contract',
          contractRegisterAgentWallet
        );

        // 7. Update agent with contract transaction hash
        const { error: updateError } = await supabase
          .from('agents')
          .update({ status: 'active' })
          .eq('id', agent.id);

        if (updateError) {
          console.error('Error updating agent status:', updateError);
        }

        return reply.status(201).send({ data: agent });
      } catch (contractError) {
        // If contract calls fail, delete the agent from database
        console.error('Error in /agents POST:', contractError);
        return reply.status(500).send({ error: (contractError as Error).message });
      }
    }
  );
}
