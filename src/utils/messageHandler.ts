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
import { backendEthersSigningWallet, SIGNATURE_WINDOW_MS, supabase, wsOps } from '../config';
import { roomService } from '../services/roomService';
import { roundService } from '../services/roundService';
import { Tables } from '../types/database.types';
import { WsMessageTypes } from '../types/ws';
import { signMessage, verifySignedMessage } from './auth';
import {
  agentMessageAiChatOutputSchema,
  agentMessageInputSchema,
  AllAgentChatMessageSchemaTypes,
  gmMessageAiChatOutputSchema,
  gmMessageInputSchema,
  observationMessageAiChatOutputSchema,
  observationMessageInputSchema,
} from './schemas';
import { roundAndAgentsPreflight } from './validation';
import { sortObjectKeys } from './sortObjectKeys';

// Add address validation helper
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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
    const verificationResult = verifySignedMessage(
      message.content,
      message.signature,
      message.sender,
      message.content.timestamp,
      SIGNATURE_WINDOW_MS
    );
    
    if (verificationResult.error) {
      return {
        error: verificationResult.error,
        statusCode: 401,
      };
    }

    const { roomId, roundId } = message.content;
    const {
      round,
      agents,
      roundAgents,
      valid: roundValid,
      reason: roundReason,
    } = await roundAndAgentsPreflight(roundId);


    const roomAgents = await roomService.getRoomAgents(roomId);

    const senderAgent = roomAgents?.data?.find((a) => a.agent_id === message.content.agentId);
    if (!senderAgent?.wallet_address) {
      return {
        error: `No wallet address found for agent ${message.content.agentId} in room_agents`,
        statusCode: 400,
      };
    }

    // Add validation for address format
    if (!isValidEthereumAddress(message.sender) || !isValidEthereumAddress(senderAgent.wallet_address)) {
      return {
        error: `Invalid Ethereum address format. Sender: ${message.sender}, Agent wallet: ${senderAgent.wallet_address}`,
        statusCode: 400,
      };
    }

    // Add debug logging
    console.log('Address comparison:', {
      messageSender: message.sender,
      agentWallet: senderAgent.wallet_address,
      agentId: message.content.agentId
    });

    // Direct case-insensitive comparison
    if (message.sender.toLowerCase() !== senderAgent.wallet_address.toLowerCase()) {
      return {
        error: `signer does not match agent address for agent ${message.content.agentId} in room_agents, expected "${senderAgent.wallet_address}" but got "${message.sender}"`,
        statusCode: 400,
      };
    }

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


    const postPvpMessages: Record<number, any> = {};
    const backendSignature = await signMessage(message.content);
    // Send processed message to all agents in the round
    for (const agent of agents) {
      const postPvpMessage = message;
      postPvpMessages[agent.id] = postPvpMessage;
      await sendMessageToAgent({
        agent,
        message: {
          ...message,
          signature: backendSignature,
          sender: backendEthersSigningWallet.address,
        },
      });
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
            pvpStatusEffects: typeof round.pvp_status_effects === 'string' 
              ? JSON.parse(round.pvp_status_effects)
              : round.pvp_status_effects || {},
          },
        }
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
      stack: err instanceof Error ? err.stack : undefined
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
        timestamp: observation.content.timestamp,
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
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: observation.content.agentId,
        original_author: observation.content.agentId,
        round_id: roundId,
        pvp_status_effects: {},
        message_type: WsMessageTypes.OBSERVATION,
        message: JSON.stringify(
          observation satisfies z.infer<typeof observationMessageAiChatOutputSchema>
        ),
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
    const { sender, content } = message;
    const { gmId, roomId, roundId, targets, timestamp, ignoreErrors = false } = content;

    // First verify signature before any DB operations
    const verificationResult = verifySignedMessage(
      content,
      message.signature,
      sender,
      timestamp,
      SIGNATURE_WINDOW_MS
    );

    if (verificationResult.error) {
      return {
        error: verificationResult.error,
        statusCode: 401,
      };
    }

    // Get round data
    const { data: round, error: roundError } = await roundService.getRound(roundId);
    if ((roundError || !round) && !ignoreErrors) {
      return {
        error: 'Error getting round: ' + roundError,
        statusCode: 500,
      };
    }

    // Verify round is active
    if (round && !round.active && !ignoreErrors) {
      return {
        error: 'Round is not active',
        statusCode: 400,
      };
    }

    // Get round agents
    const { data: roundAgents, error: roundAgentsError } = 
      await roundService.getRoundAgents(roundId);
      
    if ((roundAgentsError || !roundAgents) && !ignoreErrors) {
      return {
        error: 'Error getting round agents: ' + roundAgentsError,
        statusCode: 500,
      };
    }

    // Get target agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .in('id', targets);

    if (agentsError || !agents) {
      return {
        error: 'Error getting agents: ' + agentsError,
        statusCode: 500,
      };
    }

    // Verify game master
    const { data: gameMaster, error: gameMasterError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', gmId)
      .eq('type', 'game-master')
      .single();

    if (gameMasterError) {
      return {
        error: gameMasterError.code === 'PGRST106' 
          ? 'Game master not found' 
          : 'Error getting Game Master: ' + gameMasterError,
        statusCode: gameMasterError.code === 'PGRST106' ? 400 : 500,
      };
    }

    // Verify signer is authorized
    if (verificationResult.signer !== backendEthersSigningWallet.address && 
        verificationResult.signer !== gameMaster.sol_wallet_address) {
      return {
        error: "Signer does not match the game master's signing wallet",
        statusCode: 401,
      };
    }

    // Check if targets exist in room history
    const allAgentsInRoom = await roomService.getRoomAgents(roomId);
    if (allAgentsInRoom.error) {
      return {
        error: 'Could not check room agents: ' + allAgentsInRoom.error,
        statusCode: 500,
      };
    }

    const agentsNotInRoom = targets.filter((targetId: number) => 
      !allAgentsInRoom.data?.some(agent => agent.id === targetId)
    );

    if (agentsNotInRoom.length > 0) {
      return {
        error: `Targets not found in room: ${agentsNotInRoom.join(', ')}`,
        statusCode: 400,
      };
    }

    // Optional round membership check
    const agentsNotInRound = targets.filter((targetId: number) =>
      !roundAgents?.some(agent => agent.id === targetId)
    );

    if (agentsNotInRound.length > 0 && !ignoreErrors) {
      return {
        error: `Targets not in round: ${agentsNotInRound.join(', ')}`,
        statusCode: 400,
      };
    }

    // Send messages and broadcast
    for (const agent of agents) {
      await sendMessageToAgent({ agent, message });
    }

    // Format message for database properly
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: gmId,
        round_id: roundId,
        original_author: gmId,
        pvp_status_effects: {},
        message_type: WsMessageTypes.GM_MESSAGE,
        message: {
          messageType: WsMessageTypes.GM_MESSAGE,
          signature: message.signature,
          sender: message.sender,
          content: message.content
        }
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
      error: err instanceof Error ? err.message : String(err),
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

    // Ensure endpoint has /message path
    let endpointUrl = new URL(endpoint);
    if (!endpointUrl.pathname.endsWith('/message')) {
      endpointUrl = new URL('/message', endpointUrl);
    }

    // Send request
    //TODO support sending over WS
    await axios.post(endpointUrl.toString(), params.message);
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