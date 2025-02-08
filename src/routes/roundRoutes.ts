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
import { supabase } from '../config';
import { roundController } from '../controllers/roundController';
import { PvpActions } from '../types/pvp';
import { KickParticipant, kickParticipantSchema } from '../utils/schemas';

export async function roundRoutes(server: FastifyInstance) {
  server.get<{
    Params: { roomId: string };
  }>(
    '/active',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);

      try {
        const { data: activeRound, error } = await supabase
          .from('rounds')
          .select('*')
          .eq('room_id', roomId)
          .eq('active', true)
          .single();

        if (error) {
          console.error('Active round fetch error:', error);
          return reply.status(404).send({
            success: false,
            error: 'No active round found for this room',
          });
        }

        return reply.send({
          success: true,
          data: activeRound,
        });
      } catch (error) {
        console.error('Error fetching active round:', error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch active round',
        });
      }
    }
  );

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
      const result = await roundController.kickParticipant(roundId, request.body.agentId);

      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }

      return reply.send({ success: true });
    }
  );

  /**
   * Apply PvP Action Endpoint
   * Adds a new PvP effect to specified agent
   *
   * Effects:
   * - SILENCE: Prevents message sending
   * - DEAFEN: Blocks message receiving
   * - POISON: Modifies message content
   * - ATTACK: Direct player interaction
   */
  server.post<{
    Params: { roundId: string };
    Body: {
      actionType: PvpActions;
      sourceId: string; // User who initiated the action
      targetId: number; // Agent being targeted
      duration: number; // Duration in milliseconds
      details?: {
        // Optional details for POISON effect
        find: string;
        replace: string;
        case_sensitive?: boolean;
      };
    };
  }>(
    '/:roundId/pvp',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
        body: {
          type: 'object',
          required: ['actionType', 'sourceId', 'targetId', 'duration'],
          properties: {
            actionType: {
              type: 'string',
              enum: ['SILENCE', 'DEAFEN', 'POISON', 'ATTACK'],
            },
            sourceId: { type: 'string' },
            targetId: { type: 'number' },
            duration: { type: 'number', minimum: 1000 }, // Min 1 second
            details: {
              type: 'object',
              properties: {
                find: { type: 'string' },
                replace: { type: 'string' },
                case_sensitive: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const pvpAction = request.body;

      try {
        const result = await roundController.applyPvPAction(roundId, pvpAction);
        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.send({ success: true, data: result.data });
      } catch (error) {
        request.log.error('Error applying PvP action:', error);
        return reply.status(500).send({
          error: 'Internal server error applying PvP action',
        });
      }
    }
  );

  /**
   * Remove PvP Effect Endpoint
   * Manually cancels an active PvP effect before expiration
   */
  server.delete<{
    Params: {
      roundId: string;
      effectId: string;
    };
  }>(
    '/:roundId/pvp/:effectId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roundId', 'effectId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' },
            effectId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { roundId, effectId } = request.params;

      try {
        const result = await roundController.removePvPEffect(parseInt(roundId), effectId);
        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.send({ success: true });
      } catch (error) {
        request.log.error('Error removing PvP effect:', error);
        return reply.status(500).send({
          error: 'Internal server error removing PvP effect',
        });
      }
    }
  );

  // Fix: Support both roomId and roundId parameters
  server.get<{
    Params: {
      roomId: string;
      roundId: string;
    };
    Querystring: {
      detail?: 'full' | 'state';
    };
  }>(
    '/:roundId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roomId', 'roundId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
            roundId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            detail: { type: 'string', enum: ['full', 'state'] },
          },
        },
      },
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const roomId = parseInt(request.params.roomId);
      const { detail } = request.query;

      console.log(
        `Processing round request - Room: ${roomId}, Round: ${roundId}, Detail: ${detail}`
      );

      try {
        // If detail=state, return round state
        if (detail === 'state') {
          console.log(`Getting round state for Round ${roundId} in Room ${roomId}`);
          const result = await roundController.getRoundStateWithAgents(roundId);
          if (!result.success) {
            console.error('Round state error:', result.error);
            return reply.status(404).send({ error: result.error });
          }
          return reply.send(result);
        }

        // Otherwise return basic round info with validation
        console.log(`Getting basic round info for Round ${roundId} in Room ${roomId}`);
        const { data: round, error } = await supabase
          .from('rounds')
          .select('*')
          .eq('id', roundId)
          .eq('room_id', roomId) // Add room validation
          .single();

        if (error) {
          console.error('Round fetch error:', error);
          return reply.status(404).send({
            error: 'Round not found or does not belong to specified room',
          });
        }

        return reply.send({
          success: true,
          data: round,
        });
      } catch (error) {
        console.error('Error fetching round:', error);
        return reply.status(500).send({
          error: 'Failed to fetch round details',
        });
      }
    }
  );
}
