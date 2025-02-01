import { FastifyInstance } from 'fastify';
import { supabase } from '../../config';
import { Observation, observationSchema } from '../types/observationTypes';

export async function observationRoutes(server: FastifyInstance) {
  // Setup new room
  server.post<{ Body: Observation }>(
    '/observations',
    {
      schema: {
        body: observationSchema,
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
            content: observation,
            creator: observation.account,
            created_at: new Date(observation.timestamp).toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('Error inserting observation:', error);
          return reply.status(500).send({ 
            error: 'Failed to store observation',
            details: error.message 
          });
        }

        console.log('Stored observation:', data);
        return reply.send({ 
          message: 'Observation received and stored',
          data 
        });

      } catch (err) {
        console.error('Error processing observation:', err);
        return reply.status(500).send({ 
          error: 'Internal server error',
          details: err instanceof Error ? err.message : 'Unknown error storing observation: ' + err
        });
      }
    }
  );
}
