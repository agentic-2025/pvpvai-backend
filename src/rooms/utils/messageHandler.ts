import axios from 'axios';
import { z } from 'zod';
import { supabase, wsOps } from '../../config';
import { Tables } from '../../types/database.types';
import {
  AgentMessageOutputMessage,
  AiChatAgentMessageOutputMessage,
  GMOutputMessage,
  ObservationOutputMessage,
  WsMessageOutputTypes,
} from '../../types/ws';
import { observationMessageInputSchema, messagesRestResponseSchema, AllAgentChatMessageSchemaTypes } from '../validators/schemas';

// // Messages from an agent participating in the room to another agent
// export async function processAgentChatMessage(message: z.infer<typeof agentChatMessageInputSchema>){
// Zod schema validation
// Round preflight
// Process message through PvP
// Send processed message to all agents in the round
// Broadcast to all players in the room
// }
type ProcessMessageResponse = {
  message?: string,
  data?: any,
  error?: string,
  statusCode: number,
}
// Message from an oracle agent to all participants in the room
export async function processObservationMessage(
  observation: z.infer<typeof observationMessageInputSchema>
): Promise<ProcessMessageResponse> {
  try {
    const { roomId, roundId } = observation.content;
    const { agents, valid: roundValid, reason: roundReason } = await roundPreflight(roundId);

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
      await wsOps.broadcastToRoom(roomId, observationAiChatMessage);


      await wsOps.broadcastToRoom({record: {
        agent_id: observation.content.agentId,
        message: JSON.stringify(observationAiChatMessage),
        round_id: roundId,
        pvp_status_effects: {},
        post_pvp_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      });

      const observationAiChatMessage: ObservationOutputMessage = {
        type: WsMessageOutputTypes.OBSERVATION_OUTPUT,
        content: {
          timestamp: observation.content.timestamp,
          observationType: observation.content.observationType,
          roomId: roomId,
          roundId: roundId,
          data: observation.content.data,
        },
      };

      const { data: recordObservationMessage, error: recordObservationError } = await supabase
        .from('round_agent_messages')
        .insert({
          round_id: roundId,
          agent_id: 1, //TODO should be id of the oracle-agent
          original_author: 1, //TODO should be id of the oracle-agent
          message_type: WsMessageOutputTypes.OBSERVATION_OUTPUT,
          pvp_status_effects: {},
          message: JSON.stringify(observationAiChatMessage),
        });

      if (recordObservationError) {
        console.error('Error recording observation message:', recordObservationError);
        //Oh well, we tried
      }

      await wsOps.broadcastToRoom(roomId, observationAiChatMessage);
    }

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

// // Message from a Player to start a PvP action
// export async function processPvpMessage(message: z.infer<typeof pvpMessageInputSchema>){

// }

// This function is for sending a message to an agent
// It is a simple wrapper around an axios call right now, but we can later extend this to track confirmations that the agent received the message
// When you reach this function, you can assume that preflights have already been done and PvP rules have already been applied.
export async function sendMessageToAgent(params: {
  agent: Partial<Tables<'agents'>>, 
  message: AllAgentChatMessageSchemaTypes,
}): Promise<{error?: string, statusCode: number}> {
  
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
