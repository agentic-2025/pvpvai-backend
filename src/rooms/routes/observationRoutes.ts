import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase, wsOps } from '../../config';
import { signedRequestHeaderSchema } from '../../middleware/signatureVerification';
import { roundController } from '../controllers/roundController';
import { ObservationOutputMessage, WsMessageOutputTypes } from '../../types/ws';
import { ErrorFragment } from 'ethers';
import { roundPreflight } from '../utils/messageHandler';

export enum ObservationType {
  WALLET_BALANCES = 'wallet-balances',
  PRICE_DATA = 'price-data',
  GAME_EVENT = 'game-event',
}

export const observationBodySchema = z.object({
  timestamp: z.number(),
  sender: z.string(),
  content: z.object({
    roomId: z.number(),
    roundId: z.number(),
    observationType: z.nativeEnum(ObservationType),
    data: z.any(),
  }),
});

interface AgentDeliveryStatus {
  agent_id: number;
  success: boolean;
  error?: string;
}

export async function observationRoutes(server: FastifyInstance) {
  // Setup new room
  server.post<{
    Headers: z.infer<typeof signedRequestHeaderSchema>;
    Body: z.infer<typeof observationBodySchema>;
  }>(
    '/observations', //TODO move this to /rooms/:roomId/rounds/:roundId/observations
    {
      schema: {
        headers: signedRequestHeaderSchema,
        body: observationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const observation = request.body;
        const { roomId, roundId } = observation.content;
        const {round, roundAgents, agents, valid: roundValid, reason: roundReason} = await roundPreflight(roundId)
        if(!roundValid) {
          return reply.status(400).send({
            error: `Round not valid: ${roundReason}`,
          });
        }
        if(!agents) {
          return reply.status(400).send({
            error: 'No agents found for round, nothing to post',
          });
        }
        
        // Insert into round_observations table
        const { data, error } = await supabase
          .from('round_observations')
          .insert({
            round_id: observation.content.roundId,
            observation_type: observation.content.observationType,
            creator: observation.sender,
            content: observation.content,
            created_at: new Date(observation.timestamp).toISOString(),
          })
          .select()
          .single();
        if (error) {
          console.error('Error inserting observation:', error);
          return reply.status(500).send({
            error: 'Failed to store observation',
            details: error.message,
          });


        }
        
        console.log('Stored observation in database:', data);

        // Check if this is round-specific data that needs to be broadcast
        if (
          observation.content.observationType === ObservationType.PRICE_DATA ||
          observation.content.observationType === ObservationType.WALLET_BALANCES
        ) {


          const deliveryStatus: AgentDeliveryStatus[] = [];
          for(const agent of agents) {
            //TODO Send message to agent here
          }
     

          const wsMessage: ObservationOutputMessage = {
            type: WsMessageOutputTypes.OBSERVATION_OUTPUT,
            timestamp: observation.timestamp,
            content:{
              observationType: observation.content.observationType,
              roomId: roomId,
              roundId: roundId,
              data: observation.content.data,
            }
          }
          const { data: recprdObservervationMessage, error: recprdObservervationError } =
            await supabase.from('round_agent_messages').insert({
              round_id: roundId,
              agent_id: 1, //TODO should be id of the oracle-agent
              original_author: 1, //TODO should be id of the oracle-agent
              message_type: WsMessageOutputTypes.OBSERVATION_OUTPUT,
              pvp_status_effects: {},
              message: JSON.stringify(wsMessage)
            });
          if(recprdObservervationError) {
            console.error('Error recording observation message:', recprdObservervationError);
            //Oh well, we tried
          }
          await wsOps.broadcastToRoom(roomId, wsMessage);
        }

        return reply.send({
          message: 'Observation received and stored',
          data,
        });
      } catch (err) {
        console.error('Error processing observation:', err);
        return reply.status(500).send({
          error: 'Internal server error',
          details: err instanceof Error ? err.message : 'Unknown error storing observation: ' + err,
        });
      }
    }
  );
}
