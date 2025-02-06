import { supabase } from '../config';
import { PvPEffect } from '../utils/schemas';

export class PvPService {
  async applyEffect(roundId: number, effect: PvPEffect): Promise<void> {
    // Update pvp_action_log by fetching current log and appending
    const { data: currentRound } = await supabase
      .from('rounds')
      .select('pvp_action_log')
      .eq('id', roundId)
      .single();
    
    const updatedLog = currentRound?.pvp_action_log || [];
    updatedLog.push(effect);

    await supabase
      .from('rounds')
      .update({
        pvp_action_log: updatedLog
      })
      .eq('id', roundId);

    // Update status effects by fetching current effects and appending
    const { data: currentEffects } = await supabase
      .from('rounds')
      .select('pvp_status_effects')
      .eq('id', roundId)
      .single();

    const updatedEffects = {
      active: [
        ...(currentEffects?.pvp_status_effects?.active || []),
        effect
      ]
    };

    await supabase
      .from('rounds')
      .update({
        pvp_status_effects: updatedEffects
      })
      .eq('id', roundId);
  }

  async storeModifiedMessage(params: {
    roundId: number;
    agentId: number;
    originalMessage: any;
    modifiedMessage: any;
    appliedEffects: PvPEffect[];
  }): Promise<void> {
    await supabase
      .from('round_agent_messages')
      .insert({
        round_id: params.roundId,
        agent_id: params.agentId,
        message: {
          original: params.originalMessage,
          modified: params.modifiedMessage,
          applied_effects: params.appliedEffects
        },
        pvp_status_effects: {
          active: params.appliedEffects,
          history: params.appliedEffects
        }
      });
  }
}

export const pvpService = new PvPService();