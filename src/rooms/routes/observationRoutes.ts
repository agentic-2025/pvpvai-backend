import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processObservationMessage } from '../utils/messageHandler';
import { messagesRestResponseSchema, observationMessageInputSchema } from '../validators/schemas';

// Observations are currently passthrough to participants, so there's no distinction between input and output
export const observationMessageOutputSchema = observationMessageInputSchema;

interface AgentDeliveryStatus {
  agent_id: number;
  success: boolean;
  error?: string;
}

export async function observationRoutes(server: FastifyInstance) {
  // Create a new observation
  server.post<{
    Body: z.infer<typeof observationMessageInputSchema>;
    Reply: z.infer<typeof messagesRestResponseSchema>;
  }>(
    '/messages/observations', //TODO move this to /rooms/:roomId/rounds/:roundId/observations
    {
      schema: {
        body: observationMessageInputSchema,
        response: {
          200: messagesRestResponseSchema,
          400: messagesRestResponseSchema,
          500: messagesRestResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await processObservationMessage(request.body);
      return reply.status(result.statusCode).send({
        message: result.message,
        data: result.data,
        error: result.error,
      });
    }
  );
}
