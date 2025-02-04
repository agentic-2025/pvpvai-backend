import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { backendEthersSigningWallet, SIGNATURE_WINDOW_MS, supabase, wsOps } from '../config';
import { roomService } from '../services/roomService';
import { roundService } from '../services/roundService';
import { Tables } from '../types/database.types';
import { WsMessageTypes } from '../types/ws';
import { signMessage, verifySignedMessage } from './auth';
import {
  agentMessageInputSchema,
  AllAgentChatMessageSchemaTypes,
  gmMessageInputSchema,
  observationMessageInputSchema,
} from './schemas';
import { roundAndAgentsPreflight } from './validation';

// // Messages from an agent participating in the room to another agent
// export async function processAgentChatMessage(message: z.infer<typeof agentChatMessageInputSchema>){
// Zod schema validation
// Round preflight
// Process message through PvP
// Send processed message to all agents in the round
// Broadcast to all players in the room
// }
type ProcessMessageResponse = {
  message?: string;
  data?: any;
  error?: string;
  statusCode: number;
};
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
        message: JSON.stringify(observation),
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

export async function processAgentMessage(
  message: z.infer<typeof agentMessageInputSchema>
): Promise<ProcessMessageResponse> {
  try {
    console.log('processing agent message', message);
    const { roomId, roundId } = message.content;
    const {
      round,
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

    // Apply PvP rules to message
    // TODO When PvP is fully implemented, apply PvP rules to the message
    // const pvpResult = await applyPvp(message);
    const postPvpMessage = message;

    const backendSignature = await signMessage(message.content);
    // Send processed message to all agents in the round
    for (const agent of agents) {
      await sendMessageToAgent({
        agent,
        message: {
          ...postPvpMessage,
          signature: backendSignature,
          sender: backendEthersSigningWallet.address,
        },
      });
    }

    // Broadcast to all players in the room
    await wsOps.broadcastToAiChat({
      roomId,
      record: {
        agent_id: message.content.agentId,
        round_id: roundId,
        original_author: message.content.agentId, //Not sure what I was thinking with this column.
        pvp_status_effects: round.pvp_status_effects,
        message_type: WsMessageTypes.AI_CHAT_AGENT_MESSAGE,
        message: JSON.stringify(postPvpMessage),
      },
    });

    return {
      message: 'Agent message processed and stored',
      data: message,
      statusCode: 200,
    };
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error processing agent message:', err.message);
      return {
        error: 'Error processing agent message: ' + err.message,
        statusCode: 500,
      };
    } else if (err instanceof AxiosError) {
      console.error('Error processing agent message:', err.response?.data);
      return {
        error: 'Error processing agent message: ' + err.response?.data,
        statusCode: 500,
      };
    } else {
      console.error('Error processing agent message:', err);
      return {
        error: 'Unknown error processing agent message: ' + err,
        statusCode: 500,
      };
    }
  }
}

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
    const { signer, error: signatureError } = verifySignedMessage(
      message.content,
      message.signature,
      sender,
      message.content.timestamp,
      SIGNATURE_WINDOW_MS
    );
    if (signatureError) {
      return {
        error: signatureError,
        statusCode: 401,
      };
    }
    if (signer !== backendEthersSigningWallet.address && signer !== gameMaster.sol_wallet_address) {
      return {
        error: "Signer does not match the game master's signing wallet",
        statusCode: 401,
      };
    }

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
        message: JSON.stringify(message),
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
