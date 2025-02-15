import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';
import { processInactiveAgents } from '../utils/messageHandler';

export class RoundService {

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

  async kickParticipant(roundId: number, agentId: number): Promise<RoomOperationResult<void>> {
    try {
      const kickData: Database['public']['Tables']['round_agents']['Update'] = {
        kicked: true,
        outcome: {
          reason: 'kicked_by_gm',
          timestamp: new Date().toISOString(),
        },
      };

      const { error } = await supabase
        .from('round_agents')
        .update(kickData)
        .eq('round_id', roundId)
        .eq('agent_id', agentId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error in kickParticipant:', err);
      return { success: false, error: 'Failed to kick participant' };
    }
  }

  async getRound(
    roundId: number
  ): Promise<{ data: Tables<'rounds'> | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.from('rounds').select('*').eq('id', roundId).single();
    return { data, error };
  }

  async getRoundAgents(
    roundId: number
  ): Promise<{ data: Tables<'round_agents'>[] | null; error: PostgrestError | null }> {
    const { data, error } = await supabase.from('round_agents').select('*').eq('round_id', roundId);
    return { data, error };
  }

  async checkInactiveAgents(roomId: number): Promise<void> {
    try {
      // Delegate to message handler for actual message checks and notifications
      await processInactiveAgents(roomId);
    } catch (error) {
      console.error('Error initiating inactive agent check:', error);
    }
  }


}

export const roundService = new RoundService();
