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
  targetMessages: Record<number, AllAgentChatMessageSchemaTypes>;
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

/**
 * Applies poison effect to message text while preserving structure
 */
function applyPoisonEffect(
  message: AgentMessage,
  find: string,
  replace: string,
  caseSensitive: boolean
): AgentMessage {
  const regex = new RegExp(find, caseSensitive ? 'g' : 'gi');

  return {
    ...message,
    content: {
      timestamp: message.content.timestamp,
      roomId: message.content.roomId,
      roundId: message.content.roundId,
      agentId: message.content.agentId,
      text: message.content.text.replace(regex, replace),
      context: message.content.context,
    },
  };
}

/**
 * Updates PvP status effects in a type-safe way for database storage
 */
function updatePvpStatusEffects(
  currentEffects: Json,
  address: string,
  effect: PvpAllPvpActionsType
): Json {
  const effects = currentEffects as Record<string, PvpAllPvpActionsType[]>;
  return {
    ...effects,
    [address]: [...(effects[address] || []), effect],
  } as Json;
}

/**
 * Main PvP processing function
 * Takes an agent message and applies active PvP effects before delivery
 */
export async function applyPvp(
  message: AllAgentChatMessageSchemaTypes,
  senderAgentId: number,
  targetAgentIds: number[],
  contractAddress: string,
  agentAddresses: Map<number, string>
): Promise<PvPResult> {
  const result: PvPResult = {
    originalMessage: message,
    targetMessages: {},
    appliedEffects: [],
    pvpStatusEffects: {} as Json,
  };

  // Early return for non-agent messages
  if (!isAgentMessage(message)) {
    result.targetMessages = Object.fromEntries(targetAgentIds.map((id) => [id, message]));
    return result;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const senderAddress = agentAddresses.get(senderAgentId);
    if (!senderAddress) {
      throw new Error(`No address found for agent ${senderAgentId}`);
    }

    // Check sender's PvP status
    const senderStatuses = await getPvpStatuses(contractAddress, senderAddress);

    // Check if sender is silenced
    const silenced = senderStatuses.find(
      (status) => status.verb.toLowerCase() === 'silence' && status.endTime > now
    );

    if (silenced) {
      const silenceEffect = silenceStatusSchema.parse({
        actionType: PvpActions.SILENCE,
        actionCategory: PvpActionCategories.STATUS_EFFECT,
        parameters: {
          target: senderAddress,
          duration: silenced.endTime - now,
        },
      });
      result.appliedEffects.push(silenceEffect);
      result.pvpStatusEffects = {
        [senderAddress]: [silenceEffect],
      } as Json;
      return result; // Silenced agents can't send messages
    }

    // Apply sender's poison if active
    let modifiedMessage = message;
    const poisoned = senderStatuses.find(
      (status) => status.verb.toLowerCase() === 'poison' && status.endTime > now
    );

    if (poisoned) {
      const params = decodeParameters(poisoned.parameters, poisoned.verb);
      if (params?.find && params?.replace) {
        modifiedMessage = applyPoisonEffect(message, params.find, params.replace, false);

        const poisonEffect = poisonStatusSchema.parse({
          actionType: PvpActions.POISON,
          actionCategory: PvpActionCategories.STATUS_EFFECT,
          parameters: {
            target: senderAddress,
            duration: poisoned.endTime - now,
            find: params.find,
            replace: params.replace,
            case_sensitive: !!params.case_sensitive, // align with frontend and use decoded value
          },
        });
        result.appliedEffects.push(poisonEffect);
        result.pvpStatusEffects = updatePvpStatusEffects(
          result.pvpStatusEffects,
          senderAddress,
          poisonEffect
        );
      }
    }

    // Process each target's effects
    for (const targetId of targetAgentIds) {
      const targetAddress = agentAddresses.get(targetId);
      if (!targetAddress) continue;

      const targetStatuses = await getPvpStatuses(contractAddress, targetAddress);

      // Skip deafened targets
      const deafened = targetStatuses.find(
        (status) => status.verb.toLowerCase() === 'deafen' && status.endTime > now
      );

      if (deafened) {
        const deafenEffect = deafenStatusSchema.parse({
          actionType: PvpActions.DEAFEN,
          actionCategory: PvpActionCategories.STATUS_EFFECT,
          parameters: {
            target: targetAddress,
            duration: deafened.endTime - now,
          },
        });
        result.appliedEffects.push(deafenEffect);
        result.pvpStatusEffects = updatePvpStatusEffects(
          result.pvpStatusEffects,
          targetAddress,
          deafenEffect
        );
        continue; // Skip deafened target
      }

      // Apply target's poison if active
      let targetMessage = modifiedMessage;
      const targetPoisoned = targetStatuses.find(
        (status) => status.verb.toLowerCase() === 'poison' && status.endTime > now
      );

      if (targetPoisoned) {
        const params = decodeParameters(targetPoisoned.parameters, targetPoisoned.verb);
        if (params?.find && params?.replace) {
          targetMessage = applyPoisonEffect(
            targetMessage,
            params.find,
            params.replace,
            !!params.case_sensitive
          );

          const poisonEffect = poisonStatusSchema.parse({
            actionType: PvpActions.POISON,
            actionCategory: PvpActionCategories.STATUS_EFFECT,
            parameters: {
              target: targetAddress,
              duration: targetPoisoned.endTime - now,
              find: params.find,
              replace: params.replace,
              case_sensitive: !!params.case_sensitive,
            },
          });
          result.appliedEffects.push(poisonEffect);
          result.pvpStatusEffects = updatePvpStatusEffects(
            result.pvpStatusEffects,
            targetAddress,
            poisonEffect
          );
        }
      }

      // Store modified message for this target
      result.targetMessages[targetId] = targetMessage;
    }

    return result;
  } catch (error) {
    console.error('Error applying PvP effects:', error);
    return {
      originalMessage: message,
      targetMessages: Object.fromEntries(targetAgentIds.map((id) => [id, message])),
      appliedEffects: [],
      pvpStatusEffects: {} as Json,
    };
  }
}
