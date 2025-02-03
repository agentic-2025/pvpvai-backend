import { FastifyInstance } from 'fastify';
import { roundController } from '../controllers/roundController';
import {
  endRoundSchema,
  KickParticipant,
  kickParticipantSchema,
  RoundMessage,
  roundMessageInputSchema,
  RoundOutcome,
} from '../utils/schemas';

export async function roundRoutes(server: FastifyInstance) {
  // AI Chat endpoint with validation
  // TODO, deprecated route, phase out for messages/agentMessage
  server.post<{
    Params: { roomId: string; roundId: string };
    Body: RoundMessage;
    Reply: { success: boolean; error?: string };
  }>(
    '/rooms/:roomId/rounds/:roundId/aiChat',
    {
      schema: {
        body: roundMessageInputSchema,
        params: {
          type: 'object',
          required: ['roundId', 'roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
            roundId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      //Return a 400 error saying this function is deprecated
      return reply.status(400).send({
        success: false,
        error: 'This route is deprecated. Use /messages/agentMessage instead.',
      });
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
            roundId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
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
            roundId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
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
