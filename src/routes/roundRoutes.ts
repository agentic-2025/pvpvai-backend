/**
 * Round Management Routes
 *
 * Handles all round-related operations including:
 * - Round state changes (end/start)
 * - Participant management (kick)
 * - PvP system interactions (apply/remove effects)
 *
 * Security:
 * - All routes validate roundId format
 * - PvP actions require duration limits
 * - Effect removal requires valid effectId
 */
import { FastifyInstance } from 'fastify';
import { roundService } from '../services/roundService';
import { KickParticipant, kickParticipantSchema } from '../utils/schemas';

export async function roundRoutes(server: FastifyInstance) {
  /**
   * Kick Participant Endpoint
   * Removes an agent from round, triggers necessary cleanup
   */
  server.post<{
    Params: { roundId: string };
    Body: KickParticipant;
  }>(
    '/:roundId/kick',
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
      const result = await roundService.kickParticipant(roundId, request.body.agentId);

      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }

      return reply.send({ success: true });
    }
  );
}
