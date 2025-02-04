import { roundService } from '../services/roundService';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB } from '../types/roundTypes';
import { supabase } from '../config';
import { Database } from '../types/database.types';

export class RoundController {
  async getOrCreateActiveRound(roomId: number): Promise<RoomOperationResult<RoundDataDB>> {
    return await roundService.getOrCreateActiveRound(roomId);
  }

  // the body of processAgentMessage was moved to roundController.ts since, currently, agent messages only come in over REST
  // can move that functionality back to a common method later when/if we support agent sending message over WS

  async endRound(roundId: number, outcome?: any): Promise<RoomOperationResult<void>> {
    return await roundService.endRound(roundId, outcome);
  }

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
}

export const roundController = new RoundController();
