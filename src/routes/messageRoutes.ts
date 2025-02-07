// Note: Messages here means messages that are sent to and from agents (room participants, GM, oracles, etc.) to the backend

// These are POST routes that participants can use instead of WS. Messages that are input through REST and WS are processed the exact same way.

// POST requests here should all implement the signatureAuth middleware to verify the message is coming from an authorized source.
// /messages/observations: Was previously /observations
// /messages/agentMessage: Was previously /rooms/:roomId/rounds/:roundId/aiChat
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processAgentMessage, processGmMessage, processObservationMessage } from '../utils/messageHandler';
import {
  agentMessageInputSchema,
  gmMessageInputSchema,
  messagesRestResponseSchema,
  observationMessageInputSchema,
} from '../utils/schemas';
import { supabase } from '../config';
import { signatureVerificationMiddleware } from '../middleware/signatureVerification';

export async function messagesRoutes(server: FastifyInstance) {
  // Register signature verification middleware
  await signatureVerificationMiddleware(server);

  // Agent Message Route
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
      try {
        const { error } = agentMessageInputSchema.safeParse(request.body);
        if (error) {
          return reply.status(400).send({
            message: 'Invalid agent message format',
            error: error.message
          });
        }

        const result = await processAgentMessage(request.body);
        return reply.status(result.statusCode).send({
          message: result.message,
          data: result.data,
          error: result.error
        });
      } catch (error) {
        console.error('Error in agent message route:', error);
        return reply.status(500).send({
          message: 'Internal server error processing agent message',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Observation Message Route
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

  // GM Message Route
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
      try {
        const result = await processGmMessage(request.body);
        return reply.status(result.statusCode).send({
          message: result.message || 'GM Message processed successfully',
          data: result.data,
          error: result.error
        });
      } catch (error) {
        console.error('Error in GM message route:', error);
        return reply.status(500).send({
          message: 'Internal server error processing GM message',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

        // Query messages for the round with pagination
        server.get<{
    Params: { roundId: string };
    Querystring: { limit?: string };
    Reply: { 
      success: boolean;
      data?: any[];
      error?: string;
    };
  }>(
    '/round/:roundId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const limit = request.query.limit ? parseInt(request.query.limit) : 50;

      try {
        const { data: messages, error } = await supabase
          .from('round_agent_messages')
          .select(`
            id,
            message,
            message_type,
            created_at,
            agent_id,
            original_author,
            pvp_status_effects
          `)
          .eq('round_id', roundId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('Error fetching round messages:', error);
          return reply.status(500).send({ 
            success: false, 
            error: 'Failed to fetch round messages' 
          });
        }

        return reply.send({
          success: true,
          data: messages
        });
      } catch (error) {
        console.error('Error in round messages route:', error);
        return reply.status(500).send({ 
          success: false, 
          error: 'Internal server error fetching round messages' 
        });
      }
    }
  );
}
