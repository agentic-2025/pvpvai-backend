/**
 * RoundController handles PvP effects and round state management
 *
 * Communication channels:
 * - WebSocket: Real-time updates for room participants
 * - REST: Alternative API for agents and external services
 *
 * Key features:
 * - PvP effect application and removal
 * - In-memory effect tracking
 * - Round state management
 * - Message broadcasting via WS/REST
 */
import { supabase } from '../config';
import { roundService } from '../services/roundService';
import { Database } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';
import { processInactiveAgents } from '../utils/messageHandler';
import { wsOps } from '../ws/operations';



export class RoundController {
  // Track PvP effects in memory for fast access

  private readonly INACTIVITY_THRESHOLD = 300000; // 5 minutes in milliseconds
  private readonly SYSTEM_GM_ID = 51; // System GM identifier

  // the body of processAgentMessage was moved to roundController.ts since, currently, agent messages only come in over REST
  // can move that functionality back to a common method later when/if we support agent sending message over WS

  async kickParticipant(roundId: number, agentId: number): Promise<RoomOperationResult<void>> {
    return await roundService.kickParticipant(roundId, agentId);
  }


  /**
   * Records an agent's trading decision during round closing
   * Only valid during the CLOSING phase of a round
   */
  async recordAgentDecision(
    roundId: number,
    agentId: number,
    decision: 1 | 2 | 3
  ): Promise<{ success: boolean; error?: string; statusCode: number }> {
    try {
      console.log(
        'recordAgentDecision, logging agent decision roundId',
        roundId,
        'agentId',
        agentId,
        'decision',
        decision
      );
      // Verify round is in CLOSING phase
      const { data: round } = await supabase
        .from('rounds')
        .select('status')
        .eq('id', roundId)
        .single();

      // if (round?.status !== 'CLOSING') {
      //   return {
      //     success: false,
      //     error: 'Trading decisions can only be made during round closing phase',
      //     statusCode: 400
      //   };
      // }

      // Record decision with timestamp
      const { error } = await supabase
        .from('round_agents')
        .update({
          outcome: {
            decision,
            timestamp: Date.now(),
          },
        })
        .eq('round_id', roundId)
        .eq('agent_id', agentId);

      if (error) {
        console.error('Error recording agent decision:', error);
        return {
          success: false,
          error: error.message,
          statusCode: 500,
        };
      }

      return {
        success: true,
        statusCode: 200,
      };
    } catch (error) {
      console.error('Error recording agent decision (outer):', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
      };
    }
  }

  /** NEW
   * Scans for agents who haven't sent messages recently
   * Triggers notifications for inactive agents
   * TODO Move me to room controller
   */
  async checkInactiveAgents(roomId: number): Promise<void> {
    try {
      // Delegate to message handler for actual message checks and notifications
      await processInactiveAgents(roomId);
    } catch (error) {
      console.error('Error initiating inactive agent check:', error);
    }
  }
}

export const roundController = new RoundController();
