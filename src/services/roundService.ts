import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB as RoundData, RoundMessageDB as RoundMessage } from '../types/roundTypes';

export class RoundService {
  private async getConfigFromRoom(roomId: number): Promise<{
    roundDuration: number;
    gameMasterId: number | null;
    error?: string;
  }> {
    const { data, error } = await supabase
      .from('rooms')
      .select('room_config')
      .eq('id', roomId)
      .single();

    if (error) {
      return { 
        roundDuration: 300,
        gameMasterId: null,
        error: error.message 
      };
    }

    const config = data?.room_config as { 
      round_duration?: string | number;
      game_master_id?: string | number; 
    } | null;

    return {
      roundDuration: config?.round_duration ? parseInt(String(config.round_duration)) : 300,
      gameMasterId: config?.game_master_id ? parseInt(String(config.game_master_id)) : null
    };
  }

  async getOrCreateActiveRound(roomId: number): Promise<RoomOperationResult<RoundData>> {
    try {
      // Get room configuration
      const { roundDuration, gameMasterId, error: configError } = await this.getConfigFromRoom(roomId);
      if (configError) {
        return { success: false, error: 'Failed to get room config: ' + configError };
      }

      // Get active round
      const { data: activeRound, error: roundError } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', roomId)
        .eq('active', true)
        .single();

      if (activeRound) {
        return { success: true, data: activeRound };
      }

      // Create new round with end time
      const roundEndsOn = new Date();
      roundEndsOn.setSeconds(roundEndsOn.getSeconds() + roundDuration);

      const roundData: Database['public']['Tables']['rounds']['Insert'] = {
        room_id: roomId,
        active: true,
        game_master_id: gameMasterId,
        round_config: {
          endsOn: roundEndsOn.toISOString()
        },
      };

      const { data: newRound, error: createError } = await supabase
        .from('rounds')
        .insert(roundData)
        .select()
        .single();

      if (createError) {
        return { success: false, error: 'Failed to create round' };
      }

      return { success: true, data: newRound };
    } catch (error) {
      console.error('Error in getOrCreateActiveRound:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  async storeRoundMessage(
    roundId: number,
    agentId: number,
    message: any
  ): Promise<RoomOperationResult<RoundMessage>> {
    try {
      const messageData: Database['public']['Tables']['round_agent_messages']['Insert'] = {
        round_id: roundId,
        agent_id: agentId,
        message: message,
      };
      console.log('messageData on storeRoundMessage', messageData);

      const { data: storedMessage, error } = await supabase
        .from('round_agent_messages')
        .insert(messageData)
        //TODO: (ad0ll) not actually sure if this select is right,
        // I changed it from agents(display_name, character_card) to agents!round_agent_messages_agent_id_fkey(display_name, character_card) to get past a type error
        .select('*, agents!round_agent_messages_agent_id_fkey(display_name, character_card)') // Specify the foreign key relationship
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: storedMessage };
    } catch (err) {
      console.error('Error storing round message:', err);
      return { success: false, error: 'Failed to store round message' };
    }
  }

  private async deactivateRoomRounds(roomId: number): Promise<void> {
    const { error } = await supabase.from('rounds').update({ active: false }).eq('room_id', roomId);

    if (error) throw error;
  }

  private async createNewRound(roomId: number): Promise<RoomOperationResult<RoundData>> {
    try {
      // Get room configuration
      const { roundDuration, gameMasterId, error: configError } = await this.getConfigFromRoom(roomId);
      if (configError) {
        return { success: false, error: 'Failed to get room config: ' + configError };
      }

      // Calculate round end time
      const roundEndsOn = new Date();
      roundEndsOn.setSeconds(roundEndsOn.getSeconds() + roundDuration);

      const roundData: Database['public']['Tables']['rounds']['Insert'] = {
        room_id: roomId,
        active: true,
        game_master_id: gameMasterId,
        round_config: {
          endsOn: roundEndsOn.toISOString(),
        },
      };

      const { data: newRound, error: createError } = await supabase
        .from('rounds')
        .insert([roundData])
        .select()
        .single();

      if (createError) {
        return { success: false, error: createError.message };
      }

      // await this.addRoomAgentsToRound(roomId, newRound.id);

      return { success: true, data: newRound };
    } catch (err) {
      console.error('Error in createNewRound:', err);
      return { success: false, error: 'Failed to create new round' };
    }
  }

  async endRound(roundId: number, outcome?: any): Promise<RoomOperationResult<void>> {
    try {
      const { error } = await supabase
        .from('rounds')
        .update({
          active: false,
          outcome: outcome,
        })
        .eq('id', roundId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error in endRound:', err);
      return { success: false, error: 'Failed to end round' };
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
}

export const roundService = new RoundService();
