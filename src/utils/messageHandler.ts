/**
 * IMPORTANT: Message Signing Protocol
 *
 * Only core message fields are included in signature verification:
 * - timestamp
 * - roomId
 * - roundId
 * - agentId
 * - text
 *
 * Additional fields like 'context' and 'messageHistory' are NOT part of the signed content.
 * This ensures signature verification remains consistent even if context changes.
 *
 * The signing process:
 * 1. Extract core fields to be signed
 * 2. Sort object keys recursively
 * 3. JSON.stringify the sorted object
 * 4. Sign/verify the resulting string
 */

import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { backendEthersSigningWallet, supabase, wsOps } from '../config';
import { applyPvp } from '../pvp';
import { roomService } from '../services/roomService';
import { roundService } from '../services/roundService';
import { Tables } from '../types/database.types';
import { WsMessageTypes } from '../types/ws';
import { signMessage } from './auth';
import {
  agentMessageInputSchema,
  AllAgentChatMessageSchemaTypes,
  gmMessageAiChatOutputSchema,
  gmMessageInputSchema,
  observationMessageAiChatOutputSchema,
  observationMessageInputSchema,
} from './schemas';
import { roundAndAgentsPreflight } from './validation';

// Add address validation helper
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

const INACTIVITY_THRESHOLD = 20000; // 20 sec
const SYSTEM_GM_ID = 51; // System GM identifier // TODO make configurable

// Constants for decision request timing
const DECISION_REQUEST_TIMEOUT = 30000; // 30 seconds until retry
const MAX_DECISION_RETRIES = 3; // Maximum number of retries for decision requests
const DECISION_CHECK_INTERVAL = 10000; // Check every 10 seconds

/**
 * NEW: Main function to check inactive agents in a round
 * 1. Gets all non-kicked agents in round
 * 2. Fetches recent messages
 * 3. Creates context from recent discussion
 * 4. Notifies agents who haven't sent messages within threshold
 */
export async function processInactiveAgents(roomId: number): Promise<void> {
  try {
    const now = new Date();
    // Convert to ISO string for PostgreSQL compatibility
    const thresholdDate = new Date(now.getTime() - INACTIVITY_THRESHOLD).toISOString();
    console.log('processInactiveAgents, thresholdDate', thresholdDate, 'roomId', roomId);

    // Modified query to only get room_agents that have actual records
    const { data: inactiveRoomAgents, error } = await supabase
      .from('room_agents')
      .select(
        `
        id,
        agent_id,
        last_message,
        agents!room_agents_agent_id_fkey (
          display_name,
          type
        )
      `
      )
      .eq('room_id', roomId)
      .lt('last_message', thresholdDate) // Using ISO string format
      .not('last_message', 'is', null); // Only get records that have a last_message

    if (error || !inactiveRoomAgents) {
      console.error('processInactiveAgents, error fetching round agents:', error);
      return;
    }

    // Get latest round for room
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (roundError || !round) {
      console.error('processInactiveAgents, error fetching round:', roundError);
      return;
    }

    // Get recent messages from all agents in the round
    const { data: recentMessages } = await supabase
      .from('round_agent_messages')
      .select(
        `
        message,
        agent_id,
        agents!round_agent_messages_agent_id_fkey (
          display_name
        )
      `
      )
      .eq('round_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Format recent messages context with proper type checking
    const messageContext =
      recentMessages
        ?.map((msg) => {
          const agentName = msg.agents?.display_name || `Agent ${msg.agent_id}`;
          // Safely access nested message content
          const messageObj = msg.message as { content?: { text?: string } } | string;
          let content = '';

          if (typeof messageObj === 'string') {
            content = messageObj;
          } else if (messageObj?.content?.text) {
            content = messageObj.content.text;
          }

          return `${agentName}: ${content || 'No message content'}`;
        })
        .join('\n') || 'No recent messages';

    // Notify each inactive agent
    for (const agent of inactiveRoomAgents) {
      await notifyInactiveAgent(roomId, agent.agent_id, messageContext);
    }
  } catch (error) {
    console.error('processInactiveAgents, error processing inactive agents:', error);
  }
}

/**
 * NEW: Sends targeted notification to an inactive agent
 * Includes recent message context to help agent participate in discussion.
 * This is separate from trading decisions which only happen at round end.
 */
async function notifyInactiveAgent(
  roundId: number,
  agentId: number,
  messageContext: string
): Promise<void> {
  try {
    console.log('notifyInactiveAgent, roundId', roundId, 'agentId', agentId);
    const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();

    if (!round) return;

    const content = {
      gmId: SYSTEM_GM_ID,
      timestamp: Date.now(),
      targets: [agentId],
      roomId: round.room_id,
      roundId: roundId,
      message: `Please participate in the ongoing discussion to avoid being kicked:\n\nRecent messages:\n${messageContext}`,
      deadline: Date.now() + 10000, // 10 second response window // TODO change if needed
      ignoreErrors: false,
      additionalData: {
        requestType: 'PARTICIPATION_REQUEST', // Changed from TRADING_DECISION
        attempt: 1,
      },
    };

    // Sign message content with backend wallet
    const signature = await signMessage(content);

    // Create properly typed GM message
    const gmMessage: z.infer<typeof gmMessageInputSchema> = {
      messageType: WsMessageTypes.GM_MESSAGE,
      signature,
      sender: backendEthersSigningWallet.address,
      content,
    };

    await processGmMessage(gmMessage);
  } catch (error) {
    console.error('Error notifying inactive agent:', error);
  }
}

/**
 * NEW: Request end-of-round trading decisions from agent
 */
export async function requestAgentDecision(roundId: number, agentId: number): Promise<void> {
  try {
    // Get round with all needed fields
    const { data: round } = await supabase
      .from('rounds')
      .select('status, room_id') // Added room_id to selection
      .eq('id', roundId)
      .single();

    if (round?.status !== 'CLOSING') {
      console.log('Not requesting decision - round not in closing phase');
      return;
    }

    // Check if agent already made a decision
    const { data: agentData } = await supabase
      .from('round_agents')
      .select('outcome')
      .eq('round_id', roundId)
      .eq('agent_id', agentId)
      .single();

    // Type check the outcome data
    const outcome = agentData?.outcome as { decision?: number } | null;
    if (outcome?.decision) {
      return; // Decision already recorded
    }

    const content = {
      gmId: SYSTEM_GM_ID,
      timestamp: Date.now(),
      targets: [agentId] as number[], // Fix: Use mutable array type
      roomId: round.room_id, // Now guaranteed to exist
      roundId,
      message: 'Please make your trading decision (BUY/HOLD/SELL)',
      deadline: Date.now() + DECISION_REQUEST_TIMEOUT,
      ignoreErrors: false,
      additionalData: {
        requestType: 'TRADING_DECISION',
        attempt: 1,
      },
    };

    const signature = await signMessage(content);
    const gmMessage: z.infer<typeof gmMessageInputSchema> = {
      messageType: WsMessageTypes.GM_MESSAGE,
      signature,
      sender: backendEthersSigningWallet.address,
      content,
    };

    await processGmMessage(gmMessage);
    await scheduleDecisionCheck(roundId, agentId, 1);
  } catch (error) {
    console.error('Error requesting agent decision:', error);
  }
}

/**
 * NEW: Check if agent has made a decision and retry if needed
 */
async function scheduleDecisionCheck(
  roundId: number,
  agentId: number,
  attempt: number
): Promise<void> {
  setTimeout(async () => {
    try {
      // Get room first to ensure we have roomId
      const room = await getAgentRoom(roundId);
      if (!room?.room_id) return;

      const { data: agentData } = await supabase
        .from('round_agents')
        .select('outcome')
        .eq('round_id', roundId)
        .eq('agent_id', agentId)
        .single();

      // Type check the outcome data
      const outcome = agentData?.outcome as { decision?: number } | null;
      if (!outcome?.decision && attempt < MAX_DECISION_RETRIES) {
        const content = {
          gmId: SYSTEM_GM_ID,
          timestamp: Date.now(),
          targets: [agentId] as number[], // Fix: Use mutable array type
          roomId: room.room_id, // Now guaranteed to exist
          roundId,
          message: `REMINDER (${attempt + 1}/${MAX_DECISION_RETRIES}): Please make your trading decision (BUY/HOLD/SELL)`,
          deadline: Date.now() + DECISION_REQUEST_TIMEOUT,
          ignoreErrors: false,
          additionalData: {
            requestType: 'TRADING_DECISION',
            attempt: attempt + 1,
          },
        } as const;

        const signature = await signMessage(content);
        const gmMessage: z.infer<typeof gmMessageInputSchema> = {
          messageType: WsMessageTypes.GM_MESSAGE,
          signature,
          sender: backendEthersSigningWallet.address,
          content,
        };

        await processGmMessage(gmMessage);
        await scheduleDecisionCheck(roundId, agentId, attempt + 1);
      }
    } catch (error) {
      console.error('Error checking agent decision:', error);
    }
  }, DECISION_CHECK_INTERVAL);
}

/**
 * NEW: Helper to get room info for an agent in a round
 */
async function getAgentRoom(roundId: number) {
  const { data } = await supabase.from('rounds').select('room_id').eq('id', roundId).single();
  return data;
}

type ProcessMessageResponse = {
  message?: string;
  data?: any;
  error?: string;
  statusCode: number;
};

// Messages from an agent participating in the room to another agent
export async function processAgentMessage(
  message: z.infer<typeof agentMessageInputSchema>
): Promise<ProcessMessageResponse> {
  try {
    // const { error: signatureError } = verifySignedMessage(
    //   sortObjectKeys(message.content),
    //   message.signature,
    //   message.sender,
    //   message.content.timestamp,
    //   SIGNATURE_WINDOW_MS
    // );
    // if (signatureError) {
    //   return {
    //     error: signatureError,
    //     statusCode: 401,
    //   };
    // }

    const { roomId, roundId } = message.content;
    const {
      round,
      agents,
      roundAgents,
      valid: roundValid,
      reason: roundReason,
    } = await roundAndAgentsPreflight(roundId);

    const { error } = await supabase
      .from('room_agents')
      .update({
        last_message: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('agent_id', message.content.agentId)
      .single();

    if (error) {
      console.error('Error updating room_agents last_message, but continuing:', error);
    }

    const agentKeys = await supabase
      .from('room_agents')
      .select('wallet_address, agent_id, agents(eth_wallet_address)')
      .eq('room_id', roomId);

    const senderAgent = agentKeys?.data?.find((a) => {
      return (
        a.agent_id === message.content.agentId || a.agents.eth_wallet_address === message.sender
      );
    });

    // console.log('agentMessage signature auth valid addresses for room', agentKeys);
    if (!senderAgent?.wallet_address) {
      return {
        error: `Could not find a wallet matching the message sender, ${message.sender}, for agent ${message.content.agentId} in room_agents for room ${roomId}`,
        statusCode: 400,
      };
    }

    // Add validation for address format
    if (
      !isValidEthereumAddress(message.sender) ||
      !isValidEthereumAddress(senderAgent.wallet_address)
    ) {
      return {
        error: `Invalid Ethereum address format. Sender: ${message.sender}, Agent wallet: ${senderAgent.wallet_address}`,
        statusCode: 400,
      };
    }

    // Add debug logging
    console.log('Address comparison:', {
      messageSender: message.sender,
      agentWallet: senderAgent.wallet_address,
      agentId: message.content.agentId,
    });

    // Direct case-insensitive comparison
    // if (message.sender.toLowerCase() !== senderAgent.wallet_address.toLowerCase()) {
    //   return {
    //     error: `signer does not match agent address for agent ${message.content.agentId} in room_agents, expected "${senderAgent.wallet_address}" but got "${message.sender}"`,
    //     statusCode: 400,
    //   };
    // }

    if (!roundValid) {
      return {
        error: `Round not valid: ${roundReason}`,
        statusCode: 400,
      };
    }
    if (!agents) {
      return {
        error: 'No agents found for round, nothing to post',
        statusCode: 400,
      };
    }

    // Get contract address for PvP checks
    const { data: room } = await supabase
      .from('rooms')
      .select('contract_address')
      .eq('id', roomId)
      .single();

    if (!room?.contract_address) {
      return {
        error: 'Room contract address not found',
        statusCode: 400,
      };
    }

    // Create map of agent IDs to wallet addresses for PvP, filtering out null values
    const agentAddresses = new Map(
      agentKeys.data
        ?.filter((agent) => agent.wallet_address != null)
        .map((agent) => [agent.agent_id, agent.wallet_address as string]) || []
    );

    // Apply PvP effects to the message
    const pvpResult = await applyPvp(
      message,
      message.content.agentId,
      agents.map((a) => a.id).filter((id) => id !== message.content.agentId),
      room.contract_address,
      agentAddresses
    );

    console.log('PvP result:', pvpResult);

    // If sender is silenced, return early
    if (Object.keys(pvpResult.targetMessages).length === 0) {
      return {
        message: 'Message blocked - sender is silenced',
        statusCode: 200,
      };
    }

    const backendSignature = await signMessage(message.content);
    const postPvpMessages: Record<number, any> = pvpResult.targetMessages;

    // Send processed messages to agents, with PvP modifications applied
    for (const agent of agents) {
      if (agent.id === message.content.agentId) {
        continue;
      }

      const postPvpMessage = postPvpMessages[agent.id];
      if (postPvpMessage) {
        // Skip if target is deafened
        await sendMessageToAgent({
          agent,
          message: {
            ...postPvpMessage,
            signature: backendSignature,
            sender: backendEthersSigningWallet.address,
          },
        });
      }
    }

    // Broadcast to all players in the room - Fix: Don't stringify an already parsed object
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: message.content.agentId,
        round_id: roundId,
        original_author: message.content.agentId, //Not sure what I was thinking with this column.
        pvp_status_effects: round.pvp_status_effects,
        message_type: WsMessageTypes.AGENT_MESSAGE,
        message: {
          messageType: WsMessageTypes.AGENT_MESSAGE,
          content: {
            timestamp: message.content.timestamp,
            roomId,
            roundId,
            senderId: message.content.agentId,
            originalMessage: message,
            originalTargets: agents
              .filter((a) => a.id !== message.content.agentId)
              .map((a) => a.id),
            postPvpMessages,
            // pvpStatusEffects: pvpResult.appliedEffects,
            pvpStatusEffects:
              typeof round.pvp_status_effects === 'string'
                ? JSON.parse(round.pvp_status_effects)
                : round.pvp_status_effects || {},
          },
        },
      },
    });

    return {
      message: 'Agent message processed and stored',
      data: message,
      statusCode: 200,
    };
  } catch (err) {
    // Enhanced error logging
    console.error('Error details:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    if (err instanceof Error) {
      return {
        error: `Error processing agent message: ${err.message}`,
        statusCode: 500,
      };
    } else {
      return {
        error: `Unknown error processing agent message: ${String(err)}`,
        statusCode: 500,
      };
    }
  }
}

// Message from an oracle agent to all participants in the room
export async function processObservationMessage(
  observation: z.infer<typeof observationMessageInputSchema>
): Promise<ProcessMessageResponse> {
  try {
    const { roomId, roundId } = observation.content;
    const {
      agents,
      valid: roundValid,
      reason: roundReason,
    } = await roundAndAgentsPreflight(roundId);

    if (!roundValid) {
      return {
        error: `Round not valid: ${roundReason}`,
        statusCode: 400,
      };
    }

    if (!agents) {
      return {
        error: 'No agents found for round, nothing to post',
        statusCode: 400,
      };
    }

    // Insert into round_observations table so we can generate reports later
    const { data, error } = await supabase
      .from('round_observations')
      .insert({
        round_id: observation.content.roundId,
        observation_type: observation.content.observationType,
        creator: observation.sender,
        content: observation.content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting observation:', error);
      return {
        error: 'Failed to store observation: ' + error.message,
        statusCode: 500,
      };
    }

    for (const agent of agents) {
      await sendMessageToAgent({ agent, message: observation });
    }

    console.log('Dumping observation message', observation);
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: observation.content.agentId,
        original_author: observation.content.agentId,
        round_id: roundId,
        pvp_status_effects: {},
        message_type: WsMessageTypes.OBSERVATION,
        message: observation satisfies z.infer<typeof observationMessageAiChatOutputSchema>,
      },
    });

    return {
      message: 'Observation received and stored',
      data,
      statusCode: 200,
    };
  } catch (err) {
    console.error('Error processing observation:', err);
    return {
      error: err instanceof Error ? err.message : 'Unknown error storing observation: ' + err,
      statusCode: 500,
    };
  }
}

// Message from a game master to specific agents in the room
// Game masters can send messages to any agent that has ever been in the room
// They can optionally ignore round membership requirements
export async function processGmMessage(
  message: z.infer<typeof gmMessageInputSchema>
): Promise<ProcessMessageResponse> {
  try {
    //Verification train, choo choo
    const { sender } = message;
    const { gmId, roomId, roundId, ignoreErrors, targets, timestamp } = message.content;

    const { data: round, error: roundError } = await roundService.getRound(roundId);
    if ((roundError || !round) && !ignoreErrors) {
      return {
        error: 'Error getting round: ' + roundError,
        statusCode: 500,
      };
    }
    if (round && !round.active && !ignoreErrors) {
      return {
        error: 'Round is not active',
        statusCode: 400,
      };
    }

    // (Ignorable) Check round open and get round
    const { data: roundAgents, error: roundAgentsError } =
      await roundService.getRoundAgents(roundId);
    if ((roundAgentsError || !roundAgents) && !ignoreErrors) {
      return {
        error: 'Error getting round agents: ' + roundAgentsError,
        statusCode: 500,
      };
    }

    // Get agents for their endpoints
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .in(
        'id',
        targets.map((t) => t)
      );
    if (agentsError) {
      return {
        error: 'Error getting agents: ' + agentsError,
        statusCode: 500,
      };
    }

    // Confirm sender has game master role
    const { data: gameMaster, error: gameMasterError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', gmId)
      .eq('type', 'game-master')
      .single();
    if (gameMasterError) {
      if (gameMasterError.code === 'PGRST106') {
        return {
          error: 'Game master not found',
          statusCode: 400,
        };
      }
      return {
        error: 'Error getting Game Master: ' + gameMasterError,
        statusCode: 500,
      };
    }

    // Verify signature
    // const { signer, error: signatureError } = verifySignedMessage(
    //   message.content,
    //   message.signature,
    //   sender,
    //   message.content.timestamp,
    //   SIGNATURE_WINDOW_MS
    // );
    // if (signatureError) {
    //   return {
    //     error: signatureError,
    //     statusCode: 401,
    //   };
    // }
    // if (signer !== backendEthersSigningWallet.address && signer !== gameMaster.sol_wallet_address) {
    //   return {
    //     error: "Signer does not match the game master's signing wallet",
    //     statusCode: 401,
    //   };
    // }

    // Check if any of the targets of the message are not in the room history.
    // GM cannot message targets that have never been in the room
    const allAgentsInRoom = await roomService.getRoomAgents(roomId);
    if (allAgentsInRoom.error) {
      return {
        error:
          'Could not check which agents have ever been associated with this room: ' +
          allAgentsInRoom.error,
        statusCode: 500,
      };
    }

    const agentsNotInRoom = targets.filter(
      (target) => !allAgentsInRoom.data?.some((agent) => agent.id === target)
    );
    if (agentsNotInRoom.length > 0) {
      return {
        error: `Some targets have never been in this room, cannot send message. Targets not found in room: ${agentsNotInRoom.join(', ')}`,
        statusCode: 400,
      };
    }

    // (Ignorable) Check if any of the targets of the message are not in the round
    // GM can bypass round membership errors if they have to send a message to clean up something,
    // TODO preflight cleans kicked, but because this is ignorable, you can bypass, not critical to fix.
    const agentsNotInRound = targets.filter(
      (target) => !roundAgents?.some((agent) => agent.id === target)
    );
    if (agentsNotInRound.length > 0 && !ignoreErrors) {
      return {
        error: `Some targets are not in the round, cannot send message. Targets not found in round: ${agentsNotInRound.join(', ')}`,
        statusCode: 400,
      };
    }

    // Send processed message to all agents in the round
    for (const agent of agents) {
      await sendMessageToAgent({
        agent,
        message,
      });
    }

    // Broadcast to all players in the room
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: gmId,
        round_id: roundId,
        original_author: gmId, //Not sure what I was thinking with this column.
        pvp_status_effects: {},
        message_type: WsMessageTypes.GM_MESSAGE,
        message: message satisfies z.infer<typeof gmMessageAiChatOutputSchema>,
      },
    });

    return {
      message: 'GM Message processed and stored',
      data: message,
      statusCode: 200,
    };
  } catch (err) {
    console.error('Error processing GM message:', err);
    return {
      error: err instanceof Error ? err.message : 'Unknown error processing GM message: ' + err,
      statusCode: 500,
    };
  }
}

// This function is for sending a message to an agent.
// Currently it only sends over REST, but it will later be extended to send over WS later
// It is a simple wrapper around an axios call right now, but we can later extend this to track confirmations that the agent received the message
// When you reach this function, you can assume that preflights have already been done and PvP rules have already been applied if they should.
export async function sendMessageToAgent(params: {
  agent: Partial<Tables<'agents'>>;
  message: AllAgentChatMessageSchemaTypes;
}): Promise<{ error?: string; statusCode: number }> {
  try {
    const { id, endpoint } = params.agent;
    if (!id || !endpoint) {
      return {
        error: `Cannot send message to agent ${id} without an id and endpoint. The following message failed to send: ${JSON.stringify(params.message, null, 2)}`,
        statusCode: 400,
      };
    }

    let pathSuffix = '';
    switch (params.message.messageType) {
      case WsMessageTypes.AGENT_MESSAGE:
        pathSuffix = '/messages/receiveAgentMessage';
        break;
      case WsMessageTypes.GM_MESSAGE:
        pathSuffix = '/messages/receiveGmMessage';
        break;
      case WsMessageTypes.OBSERVATION:
        pathSuffix = '/messages/receiveObservation';
        break;
      default:
        return {
          error: `Tried to send unsupported message type to agent ${id}: ${params.message.messageType}`,
          statusCode: 400,
        };
    }

    console.log('Sending message to agent at', endpoint, pathSuffix);

    // Ensure endpoint has /message path
    let endpointUrl = new URL(pathSuffix, endpoint);
    // if (!endpointUrl.pathname.endsWith('/message')) {
    //   endpointUrl = new URL('/message', endpointUrl);
    // }
    console.log('Sending message to agent at', endpointUrl.toString());

    // Send request
    //TODO support sending over WS
    // TODO don't wait for response, or you'll loop. Can fix this w/ async callback later when we implement WS
    axios.post(endpointUrl.toString(), params.message).catch((err) => {
      if (err instanceof AxiosError) {
        console.error(
          `Error sending message to agent ${params.agent.id} at ${params.agent.endpoint} (catch block, axios):`,
          err.response?.data
        );
      } else {
        console.error(
          `Error sending message to agent ${params.agent.id} at ${params.agent.endpoint} (catch block):`,
          err
        );
      }
    });
    console.log('Message sent to agent', params.agent.id, 'endpoint', params.agent.endpoint);
    // console.log('Response', response.data);

    return {
      statusCode: 200,
    };
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Error sending message to agent:', error.response?.data);
      return {
        error: error.response?.data,
        statusCode: 500,
      };
    }

    console.error('Error sending message to agent:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error sending message to agent',
      statusCode: 500,
    };
  }
}
