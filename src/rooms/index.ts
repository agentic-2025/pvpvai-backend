import axios from 'axios';
import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { AGENT_ENDPOINT, supabase, wsOps } from '../config';
import { Database } from '../database.types';
import { DataAndError } from '../types/rest';
import { AIChatContent, WSMessageOutput } from '../types/ws';

export default async function roomRoutes(server: FastifyInstance, options: FastifyServerOptions) {
  // POST /rooms/
  server.post<{
    Body: Database['public']['Tables']['rooms']['Insert'];
    Reply: DataAndError<Database['public']['Tables']['rooms']['Row']>;
  }>('', async (request, reply) => {
    try {
      const roomsData = request.body;
      const { data: room, error } = await supabase
        .from('rooms')
        .insert(roomsData)
        .select()
        .single();

      if (error) {
        console.error('Error inserting agent:', error);
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(201).send({ data: room });
    } catch (err) {
      console.error('Error in /agent POST:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // validate signature
  server.post<{
    Params: { roomId: number };
    Body: { agent_id: number; timestamp: number; signature: string; content: any };
    Reply: { data?: any; error?: string };
  }>('/:roomId/aiChat', async (request, reply) => {
    try {
      const { roomId } = request.params;
      const { agent_id, timestamp, signature, content } = request.body;
      const { data: _, error: error } = await supabase
        .from('room_agents')
        .select('*')
        .eq('room_id', roomId)
        .eq('agent_id', agent_id)
        .single();

      if (error) {
        console.error('Error agent is not in room:', error);
        return reply.status(400).send({ error: error.message });
      }

      const { data: roundData, error: roundError } = await supabase
        .from('rounds')
        .select('*, round_agents(*)')
        .eq('room_id', roomId)
        .eq('active', true)
        .single();

      if (roundError) {
        console.error('Error getting round:', roundError);
        return reply.status(400).send({ error: roundError.message });
      }

      const agentIds = roundData.round_agents.map((roundAgent) => roundAgent.id);
      const promises = agentIds.map((agentId) =>
        sendMessageToAgent({
          roomId: roomId,
          agentId: agentId,
          roundId: roundData.id,
          content: content,
          timestamp: timestamp,
          signature: signature,
        })
      );

      await Promise.all(promises);

      return reply.status(200).send({ data: 'Message sent to agents' });
    } catch (err) {
      console.error('Error in /agent POST:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}

async function sendMessageToAgent(params: {
  roomId: number;
  agentId: number;
  roundId: number;
  content: any;
  timestamp: number;
  signature: string;
}): Promise<void> {
  const { roomId, agentId, roundId, content, timestamp, signature } = params;

  try {
    await axios.post(`${AGENT_ENDPOINT}/${agentId}/message`, {
      text: content,
    });

    const agentMessagePayload: Database['public']['Tables']['round_agent_messages']['Insert'] = {
      agent_id: agentId,
      round_id: roundId,
      message: content,
    };

    const { data: roundAgentMessageData, error: insertError } = (await supabase
      .from('round_agent_messages')
      .insert(agentMessagePayload)
      .select()
      .single()) as {
      data: Database['public']['Tables']['round_agent_messages']['Row'];
      error?: any;
    };

    if (insertError) {
      console.error('Error inserting agent message:', insertError);
      return;
    }

    const wsMessage: WSMessageOutput = {
      type: 'ai_chat',
      timestamp: timestamp,
      signature: signature,
      content: {
        message_id: roundAgentMessageData.id || 0,
        content: content,
      } as AIChatContent,
    };

    wsOps.broadcastToRoom(roomId, wsMessage);

    console.log(`Message sent to agent ${agentId} successfully.`);
  } catch (error: any) {
    console.error(`Failed to send message to agent ${agentId} with error:`, error);
  }
}
