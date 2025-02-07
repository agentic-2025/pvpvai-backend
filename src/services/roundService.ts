import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB as RoundData, RoundMessageDB as RoundMessage } from '../types/roundTypes';

export class RoundService {

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
}

export const roundService = new RoundService();
