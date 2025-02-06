// Note: Messages here means messages that are sent to and from agents (room participants, GM, oracles, etc.) to the backend

// These are POST routes that participants can use instead of WS. Messages that are input through REST and WS are processed the exact same way.

// POST requests here should all implement the signatureAuth middleware to verify the message is coming from an authorized source.
// /messages/observations: Was previously /observations
// /messages/agentMessage: Was previously /rooms/:roomId/rounds/:roundId/aiChat

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  processAgentMessage,
  processGmMessage,
  processObservationMessage,
} from '../utils/messageHandler';
import {
  agentMessageInputSchema,
  gmMessageInputSchema,
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
    '/observations',
    {
      schema: {
        body: {
          type: 'object',
          required: ['signature', 'messageType', 'sender', 'content'],
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
    '/agentMessage',
    {
      schema: {
        body: {
          type: 'object',
          required: ['signature', 'messageType', 'sender', 'content'],
        },
      },
    },
    async (request, reply) => {
      const { data, error } = agentMessageInputSchema.safeParse(request.body);

      if (error) {
        console.log(`invalid agent message (${request.body?.messageType})`, error);
        return reply.status(400).send({
          message: 'Invalid agent message',
          error: error.message,
        });
      }
      const result = await processAgentMessage(data);
      console.log('processAgentMessage result', result);
      return reply.status(result.statusCode).send({
        message: result.message,
        data: result.data,
        error: result.error?.toString(),
      });
    }
  );
  
  // TODO This is a debug route, remove before prod unless it ends up being useful
  // Create a new GM message
  server.post<{
    Body: z.infer<typeof gmMessageInputSchema>;
    Reply: z.infer<typeof messagesRestResponseSchema>;
  }>(
    '/gmMessage',
    {
      schema: {
        body: {
          type: 'object',
          required: ['signature', 'messageType', 'sender', 'content'],
        },
      },
    },
    async (request, reply) => {
      const { data, error } = gmMessageInputSchema.safeParse(request.body);
      
      if (error) {
        console.log(`invalid GM message format:`, error);
        return reply.status(400).send({
          message: 'Invalid GM message format',
          error: error.message,
        });
      }

      const result = await processGmMessage(data);
      
      // Add proper error logging
      if (result.error) {
        console.error('Error processing GM message:', result.error);
      }
      
      return reply.status(result.statusCode).send({
        message: result.message,
        data: result.data,
        error: result.error
      });
    }
  );
}
