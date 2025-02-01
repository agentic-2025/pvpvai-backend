import { supabase } from '../../config';
import { RoomOperationResult } from '../types/roomTypes';
import { Observation, ObservationCreateInput, RoundObservation } from '../types/observationTypes';
import { hashMessage } from '@coinbase/coinbase-sdk';
import { Database } from '../../types/database.types';

export class RoundObservationsService {
  async createObservation(data: ObservationCreateInput): Promise<RoomOperationResult<RoundObservation>> {
    try {
      const observationData = {
        round_id: data.round_id,
        observation_type: data.observation_type as 'wallet-balances' | 'price-update' | 'game-event',
        content: data.content,
        creator: data.creator || null
      };

      const { data: observation, error } = await supabase
        .from('round_observations')
        .insert(observationData)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: observation as RoundObservation };
    } catch (err) {
      console.error('Error in createObservation:', err);
      return { success: false, error: 'Failed to create observation' };
    }
  }

  async getLatestObservation(roundId: number, type: 'wallet-balances' | 'price-update' | 'game-event' = 'wallet-balances'): Promise<RoomOperationResult<RoundObservation>> {
    try {
      const { data: observation, error } = await supabase
        .from('round_observations')
        .select('*')
        .eq('round_id', roundId)
        .eq('observation_type', type)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: observation as RoundObservation };
    } catch (err) {
      console.error('Error in getLatestObservation:', err);
      return { success: false, error: 'Failed to get latest observation' };
    }
  }

  async calculatePercentageChanges(
    roundId: number,
    currentBalances: Record<string, any>
  ): Promise<Record<string, { nativeChange: number | null; usdChange: number | null }>> {
    const lastObservation = await this.getLatestObservation(roundId);
    if (!lastObservation.success || !lastObservation.data) {
      return Object.keys(currentBalances).reduce((acc, agentId) => {
        acc[agentId] = { nativeChange: null, usdChange: null };
        return acc;
      }, {} as Record<string, { nativeChange: number | null; usdChange: number | null }>);
    }

    const previousBalances = lastObservation.data.content.walletBalances;
    const changes: Record<string, { nativeChange: number | null; usdChange: number | null }> = {};

    Object.entries(currentBalances).forEach(([agentId, currentBalance]) => {
      const previousBalance = previousBalances[agentId];
      if (!previousBalance) {
        changes[agentId] = { nativeChange: null, usdChange: null };
        return;
      }

      const nativeChange = ((parseFloat(currentBalance.nativeValue) - parseFloat(previousBalance.nativeValue)) 
        / parseFloat(previousBalance.nativeValue)) * 100;
      
      const usdChange = ((parseFloat(currentBalance.usdValue) - parseFloat(previousBalance.usdValue)) 
        / parseFloat(previousBalance.usdValue)) * 100;

      changes[agentId] = {
        nativeChange: isNaN(nativeChange) ? null : nativeChange,
        usdChange: isNaN(usdChange) ? null : usdChange
      };
    });

    return changes;
  }

  verifyObservationSignature(observation: Observation, expectedSigner: string): boolean {
    try {
      // Create message hash from observation content excluding signature
      const { signature, ...contentWithoutSignature } = observation;
      const messageHash = hashMessage(JSON.stringify(contentWithoutSignature));

      // Verify signature
      // Note: This is a placeholder. Implement actual signature verification logic
      // based on your chain requirements (e.g., ethers.utils.verifyMessage for EVM)
      return true;
    } catch (err) {
      console.error('Error verifying signature:', err);
      return false;
    }
  }
}

export const roundObservationsService = new RoundObservationsService();