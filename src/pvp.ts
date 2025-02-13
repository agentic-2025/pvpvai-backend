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
import { ethers } from 'ethers';
import { z } from 'zod';
import { ethersProvider } from './config';
import { agentMessageInputSchema } from './schemas/agentMessage';
import {
  attackActionSchema,
  deafenStatusSchema,
  poisonStatusSchema,
  PvpActionCategories,
  PvpActions,
  PvpAllPvpActionsType,
  silenceStatusSchema,
} from './schemas/pvp';
import { WsMessageTypes } from './schemas/wsServer';
import { roomAbi } from './types/contract.types';
import { Json } from './types/database.types';
import { AllAgentChatMessageSchemaTypes } from './utils/schemas';
/**
 * Defines the structure of PvP status data returned from the smart contract
 */
interface PvpStatus {
  endTime: number; // Unix timestamp when the effect expires
  instigator: string; // Address of who applied the effect
  parameters: string; // Hex-encoded JSON string containing effect parameters
  verb: string; // The type of effect (e.g., 'silence', 'deafen', 'poison')
}

/**
 * Core response type for PvP message processing
 * Aligns with database schema for round_agent_messages
 */
export interface PvPResult {
  originalMessage: AllAgentChatMessageSchemaTypes;
  // originalTargets: number[];
  targetMessages: Record<number, z.infer<typeof agentMessageInputSchema>>;
  appliedEffects: PvpAllPvpActionsType[];
  pvpStatusEffects: Json;
}

/**
 * Type representing a valid agent message that can be processed by PvP
 */
type AgentMessage = Extract<
  AllAgentChatMessageSchemaTypes,
  {
    messageType: typeof WsMessageTypes.AGENT_MESSAGE;
    content: {
      timestamp: number;
      roomId: number;
      roundId: number;
      agentId: number;
      text: string;
      context?: any[];
    };
  }
>;

/**
 * Type guard to ensure we're working with a valid agent message
 */
function isAgentMessage(message: AllAgentChatMessageSchemaTypes): message is AgentMessage {
  return (
    message.messageType === WsMessageTypes.AGENT_MESSAGE &&
    'content' in message &&
    typeof message.content === 'object' &&
    message.content !== null &&
    'text' in message.content &&
    typeof message.content.text === 'string'
  );
}

/**
 * Decodes hex-encoded parameters from contract
 */
function decodeParameters(parametersHex: string, verb: string): any {
  try {
    const cleanHex = parametersHex.startsWith('0x') ? parametersHex.slice(2) : parametersHex;
    const parametersStr = Buffer.from(cleanHex, 'hex').toString('utf8');
    const rawParameters = JSON.parse(parametersStr);

    // Convert target address if present
    if (rawParameters.target) {
      rawParameters.target = ethers.getAddress(rawParameters.target.toString(16));
    }

    // Validate parameters based on verb type
    switch (verb.toUpperCase()) {
      case PvpActions.ATTACK:
        return attackActionSchema.shape.parameters.parse(rawParameters);
      case PvpActions.SILENCE:
        return silenceStatusSchema.shape.parameters.parse(rawParameters);
      case PvpActions.DEAFEN:
        return deafenStatusSchema.shape.parameters.parse(rawParameters);
      case PvpActions.POISON:
        return poisonStatusSchema.shape.parameters.parse(rawParameters);
      default:
        throw new Error(`Unknown verb type: ${verb}`);
    }
  } catch (error) {
    console.error('Error decoding parameters:', error);
    return null;
  }
}

/**
 * Gets current PvP statuses from contract
 */
async function getPvpStatuses(contractAddress: string, agentAddress: string): Promise<PvpStatus[]> {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
    const contract = new ethers.Contract(contractAddress, roomAbi, provider);
    const statuses = await contract.getPvpStatuses(agentAddress);

    return statuses;
  } catch (error) {
    console.error('Error fetching PvP statuses:', error);
    return [];
  }
}



// applySilenceEffect
// If sender is silent, empty targetMessages
function applySilenceEffect({
  senderStatuses,
  targetMessages,
  currentBlockTimestamp,
}: {
  senderStatuses: PvpStatus[];
  targetMessages: Record<number, z.infer<typeof agentMessageInputSchema>>;
  currentBlockTimestamp: number;
}): Record<number, z.infer<typeof agentMessageInputSchema>> {
  const silenced = senderStatuses.find((status) => {
    status.verb.toLowerCase() === 'silence' && status.endTime > currentBlockTimestamp;
  });

  if (silenced) {
    console.log('sender is silent, empty targetMessages');
    return {} as Record<number, z.infer<typeof agentMessageInputSchema>>;
  }

  return targetMessages;
}

// applyDeafenEffect
// If a given target is deafened, remove them from targetMessages
function applyDeafenEffect({
  targetStatuses,
  targetMessages,
  currentBlockTimestamp,
}: {
  targetStatuses: Record<string, PvpStatus[]>;
  targetMessages: Record<string, z.infer<typeof agentMessageInputSchema>>;
  currentBlockTimestamp: number;
}): Record<number, z.infer<typeof agentMessageInputSchema>> {
  for (const targetId of Object.keys(targetMessages)) {
    const targetStatus = targetStatuses[targetId];

    const deaf = targetStatus.find((status) => {
      status.verb.toLowerCase() === 'deafen' && status.endTime > currentBlockTimestamp;
    });
    if (deaf) {
      console.log(`target ${targetId} is deaf, remove from targetMessages`);
      delete targetMessages[targetId];
    }
  }
  return targetMessages;
}

// applyPoisonEffect
// If sender is poisoned, find and replace on every target message
// Then check if each target is poisoned and apply the poison effect to their individual messages
function applyPoisonEffect({
  unmodifiedOriginalMessage,
  senderStatuses,
  targetStatuses,
  targetMessages,
  currentBlockTimestamp,
  senderAddress,
}: {
  unmodifiedOriginalMessage: string;
  senderStatuses: PvpStatus[];
  targetStatuses: Record<string, PvpStatus[]>;
  targetMessages: Record<string, z.infer<typeof agentMessageInputSchema>>;
  currentBlockTimestamp: number;
  senderAddress: string;
}): Record<number, z.infer<typeof agentMessageInputSchema>> {
  // First apply sender's poison if active
  const senderPoisoned = senderStatuses.find(
    (status) => status.verb.toLowerCase() === 'poison' && status.endTime > currentBlockTimestamp
  );

  if (senderPoisoned) {
    console.log('sender is poisoned, find and replace on all target messages');
    const params = decodeParameters(senderPoisoned.parameters, senderPoisoned.verb);
    if (params?.find && params?.replace) {
      // Apply poison to all target messages
      Object.keys(targetMessages).forEach((targetId) => {
        const message = targetMessages[targetId];
        // Do the find and replace and check if the message was modified

        targetMessages[targetId] = {
          ...message,
          content: {
            ...message.content,
            text: message.content.text.replace(
              new RegExp(params.find, params.case_sensitive ? 'g' : 'gi'),
              params.replace
            ),
          },
        };
        if (message.content.text !== unmodifiedOriginalMessage) {
          console.log(`${targetId} message was modified by sender poison`);
          console.log('original message', unmodifiedOriginalMessage);
          console.log('modified message', message.content.text);
        }
      });

      // Record the effect
      const poisonEffect = poisonStatusSchema.parse({
        actionType: PvpActions.POISON,
        actionCategory: PvpActionCategories.STATUS_EFFECT,
        parameters: {
          target: senderAddress,
          duration: senderPoisoned.endTime - currentBlockTimestamp,
          find: params.find,
          replace: params.replace,
          case_sensitive: !!params.case_sensitive,
        },
      });
    }
  }

  // Then apply each target's poison if active
  for (const [targetId, message] of Object.entries(targetMessages)) {
    const targetStatus = targetStatuses[targetId];
    if (!targetStatus) continue;

    const targetPoisoned = targetStatus.find(
      (status) => status.verb.toLowerCase() === 'poison' && status.endTime > currentBlockTimestamp
    );

    if (targetPoisoned) {
      const params = decodeParameters(targetPoisoned.parameters, targetPoisoned.verb);
      if (params?.find && params?.replace) {
        const prePoisonMessage = message.content.text;
        // Apply poison to this target's message
        targetMessages[targetId] = {
          ...message,
          content: {
            ...message.content,
            text: message.content.text.replace(
              new RegExp(params.find, params.case_sensitive ? 'g' : 'gi'),
              params.replace
            ),
          },
        };
        if (message.content.text !== prePoisonMessage) {
          console.log(`${targetId} message was modified by target poison`);
          console.log('original message', prePoisonMessage);
          console.log('modified message', message.content.text);
        }
      }
    }
  }

  return targetMessages;
}

/**
 * Takes an agent message and applies active PvP effects before delivery
 */
export async function applyPvp(
  originalMessage: z.infer<typeof agentMessageInputSchema>,
  senderAgentId: number,
  targetAgentIds: number[],
  contractAddress: string,
  agentAddresses: Map<number, string>
): Promise<PvPResult> {
  console.log('applying PvP');

  try {
    console.log('Applying PvP to message', originalMessage);

    const result: PvPResult = {
      originalMessage: originalMessage,
      // originalTargets: targetAgentIds,
      targetMessages: {},
      appliedEffects: [],
      pvpStatusEffects: {} as Json,
    };

    // Initialize targetMessages as a copy of source. If no PvP effects are applied, we will send the original message to all targets
    result.targetMessages = Object.fromEntries(targetAgentIds.map((id) => [id, originalMessage]));

    const senderAddress = agentAddresses.get(senderAgentId);
    if (!senderAddress) {
      throw new Error(`No address found for agent ${senderAgentId}`);
    }

    console.log('Fetching pvp status from the contract for', [...targetAgentIds, senderAgentId]);
    const currentBlock = await ethersProvider.getBlock('latest');
    if (!currentBlock) {
      throw new Error('Failed to get current block, cannot apply PvP');
    }
    const currentBlockTimestamp = currentBlock.timestamp;
    console.log('currentBlockTimestamp being used for PvP checks', currentBlockTimestamp);
    const currentStatusesForAgentsById: Record<number, PvpStatus[]> = {};
    for (const targetId of [...targetAgentIds, senderAgentId]) {
      const targetAddress = agentAddresses.get(targetId);
      if (!targetAddress) continue;
      const statuses = await getPvpStatuses(contractAddress, targetAddress);
      currentStatusesForAgentsById[targetId] = statuses;
    }

    console.log('currentStatusesForAgentsById', currentStatusesForAgentsById);

    result.targetMessages = applySilenceEffect({
      senderStatuses: currentStatusesForAgentsById[senderAgentId],
      targetMessages: result.targetMessages,
      currentBlockTimestamp,
    });

    result.targetMessages = applyDeafenEffect({
      targetStatuses: currentStatusesForAgentsById,
      targetMessages: result.targetMessages,
      currentBlockTimestamp,
    });

    result.targetMessages = applyPoisonEffect({
      unmodifiedOriginalMessage: originalMessage.content.text,
      senderStatuses: currentStatusesForAgentsById[senderAgentId],
      targetStatuses: currentStatusesForAgentsById,
      targetMessages: result.targetMessages,
      currentBlockTimestamp,
      senderAddress,
    });

    return result;
  } catch (error) {
    console.error('Error applying PvP effects:', error);
    return {
      originalMessage: originalMessage,
      targetMessages: Object.fromEntries(targetAgentIds.map((id) => [id, originalMessage])),
      appliedEffects: [],
      pvpStatusEffects: {} as Json,
    };
  }
}
