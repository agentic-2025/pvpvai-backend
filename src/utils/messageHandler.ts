import axios from 'axios';
import { z } from 'zod';
import { backendEthersSigningWallet, supabase, wsOps } from '../config';
import { Tables } from '../types/database.types';
import { WsMessageOutputTypes } from '../types/ws';
import { signMessage } from './auth';
import {
  AllAgentChatMessageSchemaTypes,
  agentMessageInputSchema,
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
        message_type: WsMessageOutputTypes.OBSERVATION_OUTPUT,
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
        message_type: WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT,
        message: JSON.stringify(postPvpMessage),
      },
    });

    return {
      message: 'Agent message processed and stored',
      data: message,
      statusCode: 200,
    };
  } catch (err) {
    console.error('Error processing agent message:', err);
    return {
      error: err instanceof Error ? err.message : 'Unknown error processing agent message: ' + err,
      statusCode: 500,
    };
  }
}

export async function processGmMessage(
  message: any //TODO wrong type
): Promise<ProcessMessageResponse> {
return {
    message: 'GM message processed',
    data: message,
    statusCode: 200,
  };
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
    console.error('Error sending message to agent:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error sending message to agent',
      statusCode: 500,
    };
  }
}
