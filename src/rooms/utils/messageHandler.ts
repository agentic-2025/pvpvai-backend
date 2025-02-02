import axios from 'axios';
import { supabase, wsOps } from '../../config';
import { Database } from '../../types/database.types';
import { AIChatContent, WSMessageOutput, WsMessageType } from '../../types/ws';

export async function sendMessageToAgent(params: {
  roomId: number;
  agentId: number;
  roundId: number;
  content: any;
  timestamp: number;
  signature: string;
}): Promise<void> {
  const { roomId, agentId, roundId, content, timestamp, signature } = params;

  try {
    const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select('endpoint, status')
      .eq('id', agentId)
      .single();

    if (agentError || !agentData) {
      console.error('Error fetching agent endpoint:', agentError);
      return;
    }

    if (agentData.status !== 'Up') {
      console.error(`Agent ${agentId} is not active, status: ${agentData.status}`);
      return;
    }

    try {
      // Extract just the text content
      const messageText = content.text?.text || content.text || content;

      // Ensure endpoint has /message path
      let endpointUrl = new URL(agentData.endpoint);
      if (!endpointUrl.pathname.endsWith('/message')) {
        endpointUrl = new URL('/message', endpointUrl);
      }

      // Send request
      await axios.post(endpointUrl.toString(), {
        text: messageText,
        roomId: roomId,
        roundId: roundId,
      });

      // Store message in database
      const agentMessagePayload: Database['public']['Tables']['round_agent_messages']['Insert'] = {
        agent_id: agentId,
        round_id: roundId,
        message: {
          text: messageText,
          timestamp: timestamp,
        },
      };

      const { data: roundAgentMessageData, error: insertError } = await supabase
        .from('round_agent_messages')
        .insert(agentMessagePayload)
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting agent message:', insertError);
        return;
      }

      // Broadcast to WebSocket
      const wsMessage: WSMessageOutput = {
        type: WsMessageType.AI_CHAT,
        timestamp: timestamp,
        signature: signature,
        content: {
          messageId: roundAgentMessageData.id,
          roomId: roomId,
          roundId: roundId,
          actor: agentId.toString(),
          sent: timestamp,
          content: {
            text: messageText,
          },
          timestamp: timestamp,
          altered: false,
        } as AIChatContent,
      };

      await wsOps.broadcastToRoom(roomId, wsMessage);
    } catch (error: any) {
      console.error(`Failed to send message to agent ${agentId}:`, error);
      console.log('Agent endpoint:', agentData.endpoint);
      console.log('Message content:', content);

      if (error.code === 'ECONNREFUSED' || error.response?.status === 502) {
        await supabase.from('agents').update({ status: 'Down' }).eq('id', agentId);
      }
    }
  } catch (error) {
    console.error(`Failed to process message for agent ${agentId}:`, error);
  }
}
