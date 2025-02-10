import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';

export class RoundObservationsService {
  async createObservation(
    data: Database['public']['Tables']['round_observations']['Insert']
  ): Promise<RoomOperationResult<Tables<'round_observations'>>> {
    try {
      const observationData = {
        round_id: data.round_id,
        observation_type: data.observation_type as
          | 'wallet-balances'
          | 'price-update'
          | 'game-event',
        content: data.content,
        creator: data.creator || null,
      };

      const { data: observation, error } = await supabase
        .from('round_observations')
        .insert(observationData)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: observation };
    } catch (err) {
      console.error('Error in createObservation:', err);
      return { success: false, error: 'Failed to create observation' };
    }
  }
}

export const roundObservationsService = new RoundObservationsService();
