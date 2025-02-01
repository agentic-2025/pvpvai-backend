import { FastifyInstance } from 'fastify';
import { roundController } from '../controllers/roundController';
import { roomController } from '../controllers/roomController';
import {
  roundMessageSchema,
  endRoundSchema,
  kickParticipantSchema,
  RoundMessage,
  RoundOutcome,
  KickParticipant
} from '../validators/schemas';

export async function roundRoutes(server: FastifyInstance) {
  // AI Chat endpoint with validation
  server.post<{
    Params: { roomId: string };
    Body: RoundMessage;
    Reply: { success: boolean; error?: string };
  }>(
    '/:roomId/aiChat',
    {
      schema: {
        body: roundMessageSchema,
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      const { agent_id, timestamp, signature, content } = request.body;

      // Check if agent is in room
      const agentResult = await roomController.isAgentInRoom(roomId, agent_id);
      if (!agentResult.success) {
        return reply.status(400).send({ success: false, error: agentResult.error });
      }

      // Get or create active round
      const roundResult = await roundController.getOrCreateActiveRound(roomId);
      if (!roundResult.success) {
        return reply.status(400).send({ success: false, error: roundResult.error });
      }

      // Process agent message with signature verification and PvP rules
      const messageResult = await roundController.processAgentMessage(
        roomId,
        roundResult.data!.id,
        agent_id,
        content,
        timestamp,
        signature
      );

      if (!messageResult.success) {
        return reply.status(400).send({ success: false, error: messageResult.error });
      }

      return reply.send({ success: true });
    }
  );

  // End round endpoint
  server.post<{
    Params: { roundId: string };
    Body: { outcome?: RoundOutcome };
  }>(
    '/rounds/:roundId/end',
    {
      schema: {
        body: endRoundSchema,
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const result = await roundController.endRound(roundId, request.body.outcome);
      
      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }
      
      return reply.send({ success: true });
    }
  );

  // Kick participant endpoint
  server.post<{
    Params: { roundId: string };
    Body: KickParticipant;
  }>(
    '/rounds/:roundId/kick',
    {
      schema: {
        body: kickParticipantSchema,
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const result = await roundController.kickParticipant(roundId, request.body.agentId);
      
      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }
      
      return reply.send({ success: true });
    }
  );
}