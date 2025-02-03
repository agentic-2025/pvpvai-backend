import axios from 'axios';
import { supabase, wsOps } from '../../config';
import {
  AgentMessageInputMessage,
  AgentMessageOutputMessage,
  AiChatAgentMessageOutputMessage,
  GMOutputMessage,
  ObservationOutputMessage,
  WsMessageInputTypes,
  WsMessageOutputTypes,
} from '../../types/ws';
import { Tables } from '../../types/database.types';

export async function roundPreflight(roundId: number): Promise<{
  round?: Tables<"rounds">,
  roundAgents?: Tables<"round_agents">[],
  agents?: Tables<"agents">[],
  valid: boolean,
  reason?: string,
}> {
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .select(`*,
      round_agents(*,
        agents(*)
      )`)
    .eq('id', roundId)
    .eq('round_agents.kicked', false)
    .single();
  if (roundError) {
    console.error('Error fetching round:', roundError);
    return {valid: false, reason: 'Error fetching round from supabase: ' + roundError?.message}
  }
  if(!roundData) {
    return {valid: false, reason: 'Round not found'}
  }
  if(!roundData.active) {
    return {valid: false, reason: 'Round is not active'}
  }
  return {valid: true, round: roundData, roundAgents: roundData.round_agents, agents: roundData.round_agents.map((roundAgent) => roundAgent.agents)}   
}


// Checks if an agent is a valid target for a message
export async function agentPreflight(agentId: number, roundId: number): Promise<{
  agent?: Partial<Tables<"agents">>, 
  valid: boolean,
  reason?: string,
}> {
  const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select(
        `endpoint, status, round_agents!inner(
        kicked
        )`
      )
      .eq('id', agentId)
      .eq('round_agents.round_id', roundId)
      .single();
    if (agentError) {
      if(agentError.code === 'PGRST106') {
        return {valid: false, reason: `Agent ${agentId} doesn't exist, or round ${roundId} doesn't exist, or agent ${agentId} is not in round ${roundId}`}
      }
      console.error('Error fetching agent endpoint:', agentError);
      return {valid: false, reason: 'Error fetching agent from supabase: ' + agentError?.message}
    }

    // No need to check status, we only check status to determine if we can add an agent to a round.
    // if (agentData.status !== 'Up') {
    //   console.error(`Agent ${agentId} is not active, status: ${agentData.status}`);
    //   return {valid: false, reason: `Agent ${agentId} is not active, status: ${agentData.status}`};
    // }
    
    if(!agentData.round_agents) {
      return {valid: false, reason: `Agent ${agentId} is not in round ${roundId}`}
    }
    if(!agentData.round_agents[0].kicked) {
      return {valid: false, reason: `Agent ${agentId} is kicked from the round`};
    }

    return {valid: true, agent: agentData};
}

// This function is for sending a message to an agent
// Assume that PvP rules have already been applied to the message when you get here
export async function sendMessageToAgent(params: {
  agentId: number;
  roomId: number;
  roundId: number;
  //AgentMessageOutputMessage = Message from other agents that has been processed through PvP
  //ObservationOutputMessage = Message from the oracle that has been processed through PvP
  //GMOutputMessage = Message from the GM, never processed through PvP
  message: AgentMessageOutputMessage | ObservationOutputMessage | GMOutputMessage;;
}): Promise<void> {
  const { roomId, agentId, roundId, message} = params;

  try {
      const {agent, round, valid, reason} = await isAgentValidTarget(agentId, roundId);
      if(!valid) {
        console.error(`Agent ${agentId} is not a valid target: ${reason}`);
        return;
      }
      if(!agent?.endpoint) {
        console.error(`Agent ${agentId} has no endpoint`);
        return;
      }
        // Extract just the text content
      const messageText = message.content.text?.text || content.text || content;

      // Ensure endpoint has /message path
      let endpointUrl = new URL(agent.endpoint);
      if (!endpointUrl.pathname.endsWith('/message')) {
        endpointUrl = new URL('/message', endpointUrl);
      }

      // Send request
      await axios.post(endpointUrl.toString(), {
        text: messageText,
        roomId: roomId,
        roundId: roundId,
      });

      const playerWsMessage: AiChatAgentMessageOutputMessage = {
        type: WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT,
        timestamp: timestamp,
        content: {
          roundId,
          agentId,
          originalMessage: messageText,
          pvpStatusEffects: {}, //
          sentMessages: {}, // Populate after PvP implemented
        },
      };
      const { data: roundAgentMessageData, error: insertError } = await supabase
        .from('round_agent_messages')
        .insert({
          agent_id: agentId,
          round_id: roundId,
          pvp_status_effects: agentData.round_agents[0].rounds.pvp_status_effects,
          message_type: 'agent_message',
          message: {
            text: messageText,
          },
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting agent message:', insertError);
        return;
      }

      // Broadcast to WebSocket
      const agentWsMessage: AgentMessageOutputMessage = {
        type: WsMessageOutputTypes.AGENT_MESSAGE_OUTPUT,
        timestamp: timestamp,
        content: {
          messageId: roundAgentMessageData.id,
          roundId,
          agentId,
          text: messageText,
        },
      };

      await wsOps.broadcastToRoom(roomId, wsMessage);
    
  } catch (error) {
    console.error(`Failed to process message for agent ${agentId}:`, error);
          console.error(`Failed to send message to agent ${agentId}:`, error);
      console.log('Agent endpoint:', agentData.endpoint);
      console.log('Message content:', content);

      if (error.code === 'ECONNREFUSED' || error.response?.status === 502) {
        await supabase.from('agents').update({ status: 'Down' }).eq('id', agentId);
      }
  }
}
