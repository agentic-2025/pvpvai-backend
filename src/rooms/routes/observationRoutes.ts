import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase, wsOps } from '../../config';
import { signedRequestHeaderSchema } from '../../middleware/signatureVerification';
import { roundController } from '../controllers/roundController';

export enum ObservationType {
  WALLET_BALANCES = 'wallet-balances',
  PRICE_DATA = 'price-data',
  GAME_EVENT = 'game-event',
}

export const observationBodySchema = z.object({
  timestamp: z.number(),
  account: z.string(),
  observationType: z.nativeEnum(ObservationType),
  content: z.any(),
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
    '/observations',
    {
      schema: {
        headers: signedRequestHeaderSchema,
        body: observationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const observation = request.body;

        // Insert into round_observations table
        const { data, error } = await supabase
          .from('round_observations')
          .insert({
            round_id: observation.content.roundId,
            observation_type: observation.observationType,
            creator: observation.account,
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
          observation.observationType === ObservationType.PRICE_DATA ||
          observation.observationType === ObservationType.WALLET_BALANCES
        ) {
          const { roomId, roundId } = observation.content;

          // Get all not kicked agents with their details
          const { data: roundAgents, error: agentsError } = await supabase
            .from('round_agents')
            .select(
              `
              agent_id,
              agents (
                id,
                endpoint
              )
            `
            )
            .eq('round_id', roundId)
            .eq('kicked', false);

          const deliveryStatus: AgentDeliveryStatus[] = [];

          if (agentsError) {
            console.error('Error fetching round agents:', agentsError);
          } else {
            // Process message for each agent and track status
            const processPromises = roundAgents?.map(async (roundAgent) => {
              const status: AgentDeliveryStatus = {
                agent_id: roundAgent.agent_id,
                success: false,
              };

              if (!roundAgent.agents) {
                status.error = 'No agent data found';
                deliveryStatus.push(status);
                return;
              }

              try {
                await roundController.processAgentMessage(
                  roomId,
                  roundId,
                  roundAgent.agent_id,
                  observation.content,
                  observation.timestamp,
                  request.headers['x-authorization-signature']
                );
                status.success = true;
              } catch (error) {
                status.error = error instanceof Error ? error.message : 'Unknown error';
                console.error(
                  `Error processing observation for agent ${roundAgent.agent_id}:`,
                  error
                );
              }
              deliveryStatus.push(status);
            });

            if (processPromises) {
              await Promise.all(processPromises);
            }
          }

          // Broadcast to all connected websocket clients in the room
          const enrichedContent = {
            ...observation.content,
            agent_delivery_status: deliveryStatus,
          };

          await wsOps.broadcastToRoom(roomId, {
            type: 'observation',
            timestamp: observation.timestamp,
            signature: request.headers['x-authorization-signature'],
            content: enrichedContent,
          });
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
