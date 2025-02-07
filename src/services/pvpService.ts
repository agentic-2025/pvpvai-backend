// import { supabase } from '../config';
// import { Database, Json } from '../types/database.types';
// import { PvPEffect } from '../utils/schemas';

// // Define database-compatible interfaces
// interface DbPvPActionLog {
//   effects: PvPEffect[];
//   [key: string]: Json | undefined;
// }

// interface DbPvPStatusEffects {
//   active: PvPEffect[];
//   history?: PvPEffect[];
//   [key: string]: Json | undefined;
// }

// export class PvPService {
//   async applyEffect(roundId: number, effect: PvPEffect): Promise<void> {
//     // Get current state with type safety
//     const { data: currentRound } = await supabase
//       .from('rounds')
//       .select('pvp_action_log, pvp_status_effects')
//       .eq('id', roundId)
//       .single();

//     // Parse existing data with type casting
//     const existingActionLog = (currentRound?.pvp_action_log as DbPvPActionLog) || { effects: [] };
//     const existingStatusEffects = (currentRound?.pvp_status_effects as DbPvPStatusEffects) || { 
//       active: [],
//       history: []
//     };

//     // Construct new state
//     const actionLog: DbPvPActionLog = {
//       effects: [...existingActionLog.effects, effect]
//     };

//     const statusEffects: DbPvPStatusEffects = {
//       active: [...existingStatusEffects.active, effect],
//       history: [...(existingStatusEffects.history || []), effect]
//     };

//     // Update both in single transaction
//     const { error } = await supabase.from('rounds')
//       .update({
//         pvp_action_log: actionLog as Json,
//         pvp_status_effects: statusEffects as Json
//       })
//       .eq('id', roundId);

//     if (error) {
//       throw new Error(`Failed to apply PvP effect: ${error.message}`);
//     }
//   }

//   // Add method to get active effects
//   async getActiveEffects(roundId: number): Promise<DbPvPStatusEffects> {
//     const { data: currentRound } = await supabase
//       .from('rounds')
//       .select('pvp_status_effects')
//       .eq('id', roundId)
//       .single();

//     return (currentRound?.pvp_status_effects as DbPvPStatusEffects) || { 
//       active: [],
//       history: []
//     };
//   }

//   async storeModifiedMessage(params: {
//     roundId: number;
//     agentId: number; 
//     originalMessage: Database['public']['Tables']['round_agent_messages']['Insert'];
//     modifiedMessage: Database['public']['Tables']['round_agent_messages']['Insert'];
//     appliedEffects: PvPEffect[];
//   }): Promise<void> {
//     const messageData: Database['public']['Tables']['round_agent_messages']['Insert'] = {
//       round_id: params.roundId,
//       agent_id: params.agentId,
//       message: {
//         original: params.originalMessage,
//         modified: params.modifiedMessage,
//         applied_effects: params.appliedEffects
//       } as Json,
//       pvp_status_effects: {
//         active: params.appliedEffects,
//         history: params.appliedEffects
//       } as Json
//     };

//     const { error } = await supabase
//       .from('round_agent_messages')
//       .insert(messageData);

//     if (error) {
//       throw new Error(`Failed to store modified message: ${error.message}`);
//     }
//   }
// }

// export const pvpService = new PvPService();