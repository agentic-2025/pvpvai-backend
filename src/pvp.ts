//TODO Implement this. Takes an AI Chat Message and target agents, and tweaks the message + targets based on the currently active PvP modifiers
// Agents can be afflicted with multiple PvP modifiers at once, so unless explicity specified, all modifiers should be applied
// Remember that only AI messages should be processed by this function. GM messages must always be sent to agents unaltered to keep things running.
// X Silenced: If the source agent is silenced, do not send the message to any targets, the source agent is not allowed to send messages
// X Target Defeaned:  If a target agent is deafened, remove the target from the message targets. A deafened agent cannot hear messages
// X Poisoned: If a source agent is poisoned, then apply a find and replace to the outgoing message. Return "altered" as true at the end (the AI Agents won't be informed that the message was altered, but we will inform the players to render the effect in the UI)
// export const applyPvp = (message: AiChatMessage, targets: Agent[]): (AiChatMessage, altered) =>
// 1. Fetch PvP statuses for all agents
// 2. Apply Silence, Deafen, Poison, etc.
// 3. Return the altered AI Chat message and a boolean indicating if the content was altered (altered = true if any PvP modifiers modified the message, the only condition that does this for now is Poison)
// }
// The other two types of PvP actions are Amnesia and Direct Attack. These actions are taken against a single agent and do not modify the message or target, so they are

// Standard types PVP implementation SILENCE DEAFEN POISON
import { supabase } from './config';
import { PvpActions, PvpActionTypes, PoisonStatus } from './types/pvp';
import { RoundMessageDB } from './types/roundTypes';

// Core response type for PvP effect application
export interface PvPResult {
  message: RoundMessageDB | null;     // Original or modified message (null if blocked)
  targets: number[];                  // Final list of target agents after effects
  actions: {
    type: PvpActions | PvpActionTypes;// Type of PvP action applied
    source: number;                   // Agent who applied the effect
    target: number;                   // Agent affected by the effect
    effect: string;                   // Result of the effect (e.g., 'message_blocked')
  }[];
}

// Structure of active PvP effects stored in database
interface ActiveEffect {
  type: PvpActions;                   // Effect type (SILENCE, DEAFEN, etc.)
  source: number;                     // Agent who applied the effect
  target: number;                     // Affected agent
  duration: number;                   // How long effect lasts
  details?: Record<string, any>;      // Additional effect parameters
}

// Message content structure with required text field
interface MessageContent {
  text: string;
  [key: string]: any;                 // Allow additional properties
}

// Extend RoundMessageDB to ensure message content structure
interface RoundMessageWithContent extends RoundMessageDB {
  message: MessageContent;
}

/**
 * Applies PvP effects to a message between agents
 * 
 * @param message - The message being sent
 * @param senderAgentId - ID of agent sending message
 * @param targetAgentIds - IDs of intended recipient agents
 * @returns Modified message, targets, and applied effects
 */
export async function applyPvp(
  message: RoundMessageWithContent,
  senderAgentId: number,
  targetAgentIds: number[]
): Promise<PvPResult> {
  const actions: PvPResult['actions'] = [];
  // Deep clone to avoid modifying original message
  let modifiedMessage: RoundMessageWithContent = JSON.parse(JSON.stringify(message));
  let modifiedTargets = [...targetAgentIds];

  try {
    // Fetch current PvP effects for the round
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('pvp_status_effects')
      .eq('id', message.round_id)
      .single();

    if (roundError) throw roundError;

    // Convert database JSON to typed array
    const activeEffects: ActiveEffect[] = Array.isArray(round?.pvp_status_effects) 
      ? (round.pvp_status_effects as unknown as ActiveEffect[]) 
      : [];

    // 1. SILENCE Check: Blocks all messages from silenced agents
    const senderSilenced = activeEffects.find(
      effect => effect.type === PvpActions.SILENCE && 
                effect.target === senderAgentId
    );

    if (senderSilenced) {
      actions.push({
        type: PvpActions.SILENCE,
        source: senderSilenced.source,
        target: senderAgentId,
        effect: 'message_blocked'
      });
      return { message: null, targets: [], actions };
    }

    // 2. DEAFEN Check: Remove deafened targets except for ATTACK messages
    modifiedTargets = modifiedTargets.filter(targetId => {
      const isDeafened = activeEffects.find(
        effect => effect.type === PvpActions.DEAFEN && 
                 effect.target === targetId
      );
      
      if (isDeafened && message.message_type !== 'pvp_attack') {
        actions.push({
          type: PvpActions.DEAFEN,
          source: isDeafened.source,
          target: targetId,
          effect: 'message_blocked'
        });
        return false;
      }
      return true;
    });

    // 3. POISON Check: Modify message content if sender is poisoned
    const senderPoisoned = activeEffects.find(
      effect => effect.type === PvpActions.POISON && 
                effect.target === senderAgentId
    ) as (ActiveEffect & { details: PoisonStatus['options'] }) | undefined;

    if (senderPoisoned && message.message_type !== 'pvp_attack' && 
        typeof modifiedMessage.message?.text === 'string') {
      const poisonDetails = senderPoisoned.details;
      
      if (poisonDetails) {
        const regex = new RegExp(
          poisonDetails.find,
          poisonDetails.case_sensitive ? 'g' : 'gi'
        );
        const newText = modifiedMessage.message.text.replace(regex, poisonDetails.replace);
        
        modifiedMessage = {
          ...modifiedMessage,
          message: {
            ...modifiedMessage.message,
            text: newText
          }
        };

        actions.push({
          type: PvpActions.POISON,
          source: senderPoisoned.source,
          target: senderAgentId,
          effect: 'message_altered'
        });
      }
    }

    return {
      message: modifiedMessage,
      targets: modifiedTargets,
      actions
    };

  } catch (error) {
    console.error('Error applying PvP effects:', error);
    // On error, allow message through unmodified
    return {
      message: modifiedMessage,
      targets: targetAgentIds,
      actions: []
    };
  }
}