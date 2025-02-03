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
import { RoundMessage } from './rooms';
import { PvPResult } from './rooms/utils/pvpHandler';

export async function applyPvp(
  message: RoundMessage,
  senderAgentId: number,
  targetAgentIds: number[]

): Promise<PvPResult> {
  // Example only; replace with actual logic and DB lookups
  let modifiedMessage = message;
  let modifiedTargets = [...targetAgentIds];
  let actions: PvPResult['actions'] = [];

  // Silence example
  const isSenderSilenced = false; // ...fetch from DB...
  if (isSenderSilenced) {
    actions.push({
      type: 'silence',
      source: senderAgentId,
      target: senderAgentId,
      effect: 'message_blocked'
    });
    return { message: null, targets: [], actions };
  }

  // Deafen example
  modifiedTargets = modifiedTargets.filter((targetId) => {
    const isDeafened = false; // ...fetch from DB...
    if (isDeafened) {
      actions.push({
        type: 'deafen',
        source: targetId,
        target: targetId,
        effect: 'message_blocked'
      });
    }
    return !isDeafened;
  });

  // Poison example
  const isSenderPoisoned = false; // ...fetch from DB...
  if (isSenderPoisoned && modifiedMessage?.text) {
    modifiedMessage.text = modifiedMessage.text.replace('hello', 'h3ll0');
    actions.push({
      type: 'poison',
      source: senderAgentId,
      target: senderAgentId,
      effect: 'message_altered'
    });
  }

  return { 
    message: modifiedMessage, 
    targets: modifiedTargets,
    actions
  };
}
