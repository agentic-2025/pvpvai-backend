import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB as RoundData, RoundMessageDB as RoundMessage } from '../types/roundTypes';

export class RoundService {
  async getOrCreateActiveRound(roomId: number): Promise<RoomOperationResult<RoundData>> {
    try {
      const { data: activeRounds, error: queryError } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', roomId)
        .eq('active', true);

      if (queryError) {
        return { success: false, error: queryError.message };
      }

      // Deactivate multiple active rounds if they exist
      if (activeRounds && activeRounds.length > 1) {
        await this.deactivateRoomRounds(roomId);
        return await this.createNewRound(roomId);
      }

      // Return existing active round
      if (activeRounds && activeRounds.length === 1) {
        return { success: true, data: activeRounds[0] };
      }

      // Create new round if none exists
      return await this.createNewRound(roomId);
    } catch (err) {
      console.error('Error in getOrCreateActiveRound:', err);
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
      // Get room configuration first
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('round_time, game_master_id')
        .eq('id', roomId)
        .single();

      if (roomError) {
        return { success: false, error: roomError.message };
      }

      // Calculate round end time
      const roundEndsOn = new Date();
      roundEndsOn.setSeconds(roundEndsOn.getSeconds() + (room.round_time || 300));

      const roundData: Database['public']['Tables']['rounds']['Insert'] = {
        room_id: roomId,
        active: true,
        game_master_id: room.game_master_id,
        round_config: {
          round_ends_on: roundEndsOn.toISOString(),
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

      await this.addRoomAgentsToRound(roomId, newRound.id);

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

  private async addRoomAgentsToRound(roomId: number, roundId: number): Promise<void> {
    const { data: roomAgents, error: fetchError } = await supabase
      .from('room_agents')
      .select('agent_id')
      .eq('room_id', roomId);

    if (fetchError) throw fetchError;

    if (roomAgents && roomAgents.length > 0) {
      const roundAgentsData = roomAgents.map((ra) => ({
        round_id: roundId,
        agent_id: ra.agent_id,
      }));

      const { error: insertError } = await supabase.from('round_agents').insert(roundAgentsData);

      if (insertError) throw insertError;
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
