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
import { roundService } from '../services/roundService';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB } from '../types/roundTypes';
import { supabase } from '../config';
import { Database } from '../types/database.types';
import { PvpActions, PvPEffect } from '../types/pvp';
import { wsOps } from '../ws/operations';
import { processInactiveAgents } from '../utils/messageHandler';

// Define message types
interface WsMessage {
  type: string;
  effect?: PvPEffect;
}

interface RestMessage {
  success: boolean;
  data?: {
    type: string;
    effect?: PvPEffect;
  };
  error?: string;
}

export class RoundController {
  // Track PvP effects in memory for fast access
  private activePvPEffects: Map<number, PvPEffect[]> = new Map();

  private readonly INACTIVITY_THRESHOLD = 300000; // 5 minutes in milliseconds
  private readonly SYSTEM_GM_ID = 51; // System GM identifier 

  // the body of processAgentMessage was moved to roundController.ts since, currently, agent messages only come in over REST
  // can move that functionality back to a common method later when/if we support agent sending message over WS



  async kickParticipant(roundId: number, agentId: number): Promise<RoomOperationResult<void>> {
    return await roundService.kickParticipant(roundId, agentId);
  }

  // Create a new round in a room
  async createRound(roomId: number, data: { game_master_id?: number; round_config?: any }) {
    try {
      const roundData: Database['public']['Tables']['rounds']['Insert'] = {
        room_id: roomId,
        active: true,
        game_master_id: data.game_master_id || null,
        round_config: data.round_config || null,
      };

      const { data: round, error } = await supabase
        .from('rounds')
        .insert(roundData)
        .select()
        .single();

      if (error) {
        console.error('Error creating round:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: round };
    } catch (error) {
      console.error('Error in createRound:', error);
      return { success: false, error: 'Failed to create round' };
    }
  }

  /**
   * Applies a new PvP effect to a round
   * Stores effect in memory and broadcasts to room
   */
  public async applyPvPAction(
    roundId: number, 
    action: {
      actionType: PvpActions;
      sourceId: string;
      targetId: number;
      duration: number;
      details?: {
        find: string;
        replace: string;
        case_sensitive?: boolean;
      };
    },
    useWebSocket: boolean = false
  ): Promise<RoomOperationResult<PvPEffect>> {
    try {
      const { data: round, error } = await this.getRound(roundId);
      if (error || !round?.active) {
        return { 
          success: false, 
          error: typeof error === 'object' && error !== null ? (error as Error).message : (error as string) || 'Round not found or inactive' 
        };
      }

      const effect: PvPEffect = {
        ...action,
        effectId: crypto.randomUUID(),
        createdAt: Date.now(),
        expiresAt: Date.now() + action.duration
      };

      const targetEffects = this.activePvPEffects.get(roundId) || [];
      targetEffects.push(effect);
      this.activePvPEffects.set(roundId, targetEffects);

      if (useWebSocket) {
        const wsMessage: WsMessage = {
          type: 'pvp_effect_applied',
          effect
        };
        await wsOps.sendMessageToRoom({
          roomId: round.room_id,
          message: wsMessage
        });
      } else {
        // REST response handled by route handler
        return { 
          success: true, 
          data: effect
        };
      }

      return { success: true, data: effect };
    } catch (error) {
      console.error('Error applying PvP action:', error);
      return { success: false, error: 'Failed to apply PvP action' };
    }
  }

  /**
   * Gets current round state including message history and active effects
   */
  public async getRoundState(
    roundId: number
  ): Promise<RoomOperationResult<{
    messageHistory: any[];
    activePvPEffects: PvPEffect[];
    phase: string;
  }>> {
    try {
      const { data: round, error } = await this.getRound(roundId);
      if (error || !round) {
        return { 
          success: false, 
          error: typeof error === 'object' && error !== null ? (error as Error).message : (error as string) || 'Round not found' 
        };
      }

      this.cleanExpiredEffects(roundId);
      const activeEffects = this.activePvPEffects.get(roundId) || [];

      const { data: messages } = await supabase
        .from('round_agent_messages')
        .select('*')
        .eq('round_id', roundId)
        .order('created_at', { ascending: false })
        .limit(8);

      return {
        success: true,
        data: {
          messageHistory: messages || [],
          activePvPEffects: activeEffects,
          phase: 'discussion' // Could be dynamic in future
        }
      };
    } catch (error) {
      console.error('Error getting round state:', error);
      return { success: false, error: 'Failed to get round state' };
    }
  }

  /**
   * Gets current round state including message history, active effects, and agent details
   */
  async getRoundStateWithAgents(roundId: number): Promise<RoomOperationResult<{
    round: any;
    agents: any[];
    messageHistory: any[];
    activePvPEffects: PvPEffect[];
    phase: string;
  }>> {
    try {
      // Check if round exists first
      const { data: roundExists, error: roundCheckError } = await supabase
        .from('rounds')
        .select('id')
        .eq('id', roundId);

      if (roundCheckError || !roundExists?.length) {
        return {
          success: false,
          error: 'Round not found'
        };
      }

      // Get basic round state
      const roundState = await this.getRoundState(roundId);
      if (!roundState.success) {
        return {
          success: false,
          error: roundState.error
        };
      }

      // Get round details with agents
      const { data: round, error } = await supabase
        .from('rounds')
        .select(`
          *,
          round_agents!round_id(
            agent_id,
            type
          )
        `)
        .eq('id', roundId)
        .single();

      if (error) {
        return { 
          success: false, 
          error: error.message 
        };
      }

      // Get all agent details
      const agentIds = round.round_agents?.map((ra: any) => ra.agent_id) || [];
      const { data: agents } = await supabase
        .from('agents')
        .select('*')
        .in('id', agentIds);

      return {
        success: true,
        data: {
          round,
          agents: agents || [],
          messageHistory: roundState.data?.messageHistory || [],
          activePvPEffects: roundState.data?.activePvPEffects || [],
          phase: roundState.data?.phase || 'discussion'
        }
      };
    } catch (error) {
      console.error('Error getting round state with agents:', error);
      return { 
        success: false, 
        error: 'Failed to get round state with agents' 
      };
    }
  }

  /**
   * Removes expired PvP effects for a round
   */
  private cleanExpiredEffects(roundId: number): void {
    const effects = this.activePvPEffects.get(roundId) || [];
    const currentTime = Date.now();
    
    this.activePvPEffects.set(
      roundId,
      effects.filter(effect => effect.expiresAt > currentTime)
    );
  }

  /**
   * Manually removes a PvP effect before expiration
   */ 
  public async removePvPEffect(
    roundId: number, 
    effectId: string,
    useWebSocket: boolean = true
  ): Promise<RoomOperationResult<void>> {
    try {
      const effects = this.activePvPEffects.get(roundId) || [];
      const effectIndex = effects.findIndex(e => e.effectId === effectId);
      
      if (effectIndex === -1) {
        return { success: false, error: 'PvP effect not found' };
      }

      const [removedEffect] = effects.splice(effectIndex, 1);
      this.activePvPEffects.set(roundId, effects);

      const { data: round } = await this.getRound(roundId);
      if (round) {
        if (useWebSocket) {
          const wsMessage: WsMessage = {
            type: 'pvp_effect_removed',
            effect: removedEffect
          };
          await wsOps.sendMessageToRoom({
            roomId: round.room_id,
            message: wsMessage
          });
        }
        // REST response handled by route handler
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing PvP effect:', error);
      return { success: false, error: 'Failed to remove PvP effect' };
    }
  }

  async getRound(roundId: number): Promise<RoomOperationResult<Database['public']['Tables']['rounds']['Row']>> {
    try {
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('id', roundId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error getting round:', error);
      return { success: false, error: 'Failed to get round' };
    }
  }

  async processGmMessage(message: any): Promise<{
    success: boolean;
    error?: string;
    statusCode: number;
  }> {
    try {
      const { roundId } = message.content;
      
      // Validate round exists
      const { data: round } = await supabase
        .from('rounds')
        .select('*')
        .eq('id', roundId)
        .single();

      if (!round) {
        return {
          success: false,
          error: 'Round not found',
          statusCode: 404
        };
      }

      // Proceed with GM message processing
      // ...rest of GM message handling...

      return {
        success: true,
        statusCode: 200
      };
    } catch (error) {
      console.error('Error processing GM message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      };
    }
  }

  /**
   * Records an agent's trading decision during round closing
   * Only valid during the CLOSING phase of a round
   */
  async recordAgentDecision(
    roundId: number,
    agentId: number,
    decision: 1 | 2 | 3 
  ): Promise<{success: boolean; error?: string; statusCode: number}> {
    try {
      // Verify round is in CLOSING phase
      const { data: round } = await supabase
        .from('rounds')
        .select('status')
        .eq('id', roundId)
        .single();

      if (round?.status !== 'CLOSING') {
        return {
          success: false,
          error: 'Trading decisions can only be made during round closing phase',
          statusCode: 400
        };
      }

      // Record decision with timestamp
      const { error } = await supabase
        .from('round_agents')
        .update({ 
          outcome: {
            decision,
            timestamp: Date.now()
          }
        })
        .eq('round_id', roundId)
        .eq('agent_id', agentId);

      if (error) {
        return {
          success: false,
          error: error.message,
          statusCode: 500
        };
      }

      return {
        success: true,
        statusCode: 200
      };
    } catch (error) {
      return {
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      };
    }
  }

  /** NEW
   * Scans for agents who haven't sent messages recently
   * Triggers notifications for inactive agents
   */
  async checkInactiveAgents(roundId: number): Promise<void> {
    try {
      const { data: round } = await this.getRound(roundId);
      if (!round?.active) return;

      // Delegate to message handler for actual message checks and notifications
      await processInactiveAgents(roundId);
    } catch (error) {
      console.error('Error initiating inactive agent check:', error);
    }
  }
}

export const roundController = new RoundController();
