// Note: Messages here means messages that are sent to and from agents (room participants, GM, oracles, etc.) to the backend

// These are POST routes that participants can use instead of WS. Messages that are input through REST and WS are processed the exact same way.

// POST requests here should all implement the signatureAuth middleware to verify the message is coming from an authorized source.
// /messages/observations: Was previously /observations
// /messages/agentMessage: Was previously /rooms/:roomId/rounds/:roundId/aiChat

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processAgentMessage, processObservationMessage } from '../utils/messageHandler';
import {
  agentMessageInputSchema,
  messagesRestResponseSchema,
  observationMessageInputSchema,
} from '../utils/schemas';

// Observations are currently passthrough to participants, so there's no distinction between input and output
export const observationMessageOutputSchema = observationMessageInputSchema;

export async function messagesRoutes(server: FastifyInstance) {
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

  // Create a new agent message
  server.post<{
    Body: z.infer<typeof agentMessageInputSchema>;
    Reply: z.infer<typeof messagesRestResponseSchema>;
  }>(
    '/messages/agentMessage',
    {
      schema: {
        body: agentMessageInputSchema,
        response: {
          200: messagesRestResponseSchema,
          400: messagesRestResponseSchema,
          500: messagesRestResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await processAgentMessage(request.body);
      return reply.status(result.statusCode).send({
        message: result.message,
        data: result.data,
        error: result.error,
      });
    }
  );
}
