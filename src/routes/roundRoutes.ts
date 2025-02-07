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
import { roundController } from '../controllers/roundController';
import {
  endRoundSchema,
  KickParticipant,
  kickParticipantSchema,
  RoundMessage,
  roundMessageInputSchema,
  RoundOutcome,
} from '../utils/schemas';
import { PvpActions } from '../types/pvp';


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
      sourceId: string;     // User who initiated the action
      targetId: number;     // Agent being targeted
      duration: number;     // Duration in milliseconds
      details?: {          // Optional details for POISON effect
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
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        },
        body: {
          type: 'object',
          required: ['actionType', 'sourceId', 'targetId', 'duration'],
          properties: {
            actionType: { 
              type: 'string', 
              enum: ['SILENCE', 'DEAFEN', 'POISON', 'ATTACK'] 
            },
            sourceId: { type: 'string' },
            targetId: { type: 'number' },
            duration: { type: 'number', minimum: 1000 }, // Min 1 second
            details: {
              type: 'object',
              properties: {
                find: { type: 'string' },
                replace: { type: 'string' },
                case_sensitive: { type: 'boolean' }
              }
            }
          }
        }
      }
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
          error: 'Internal server error applying PvP action' 
        });
      }
    }
  );

  /**
   * Get Round State Endpoint
   * Returns current round status including:
   * - Message history
   * - Active PvP effects
   * - Current phase
   */
  server.get<{
    Params: { roundId: string };
  }>(
    '/:roundId/state',
    {
      schema: {
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
      
      try {
        const result = await roundController.getRoundState(roundId);
        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.send({ 
          success: true, 
          data: {
            messageHistory: result.data?.messageHistory ?? [],
            activePvPEffects: result.data?.activePvPEffects ?? [],
            phase: result.data?.phase ?? 'discussion'
          }
        });
      } catch (error) {
        request.log.error('Error getting round state:', error);
        return reply.status(500).send({ 
          error: 'Internal server error getting round state' 
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
            effectId: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const { roundId, effectId } = request.params;
      
      try {
        const result = await roundController.removePvPEffect(
          parseInt(roundId), 
          effectId
        );
        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.send({ success: true });
      } catch (error) {
        request.log.error('Error removing PvP effect:', error);
        return reply.status(500).send({ 
          error: 'Internal server error removing PvP effect' 
        });
      }
    }
  );
}
