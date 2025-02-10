import { WebSocket } from 'ws';
import { z } from 'zod';
import { supabase } from '../config';
import {
  participantsInputMessageSchema,
  subscribeRoomInputMessageSchema,
} from '../schemas/wsServer';
import { Database } from '../types/database.types';
import { processGmMessage } from '../utils/messageHandler';
import { roundPreflight } from '../utils/validation';
import { wsServer } from './server';
import { publicChatMessageInputSchema } from '../schemas/publicChat';
import { gmMessageInputSchema } from '../schemas/gmMessage';

export class WSOperations {
  async handlePublicChat(
    client: WebSocket,
    message: z.infer<typeof publicChatMessageInputSchema>
  ): Promise<void> {
    console.log('Handling public chat message', message);

    try {
      const { content } = message;
      const { roundId } = content;

      const { round, valid, reason } = await roundPreflight(roundId);
      if (!valid) {
        console.log('Public chat message failed round preflight', reason);
        await wsServer.sendSystemMessage(client, reason, true, message);
        return;
      }

      await this.broadcastToPublicChat({
        roomId: round.room_id,
        record: {
          round_id: roundId,
          message: message,
        },
      });

      console.log(
        `Public chat message from user ${message.sender} broadcasted to room #${round.room_id}`,
        message
      );
    } catch (error) {
      console.error(`Failed to handle public chat message:`, error);
      await wsServer.sendSystemMessage(
        client,
        'Failed to handle public chat message',
        true,
        message
      );
    }
  }

  async handleParticipants(
    client: WebSocket,
    message: z.infer<typeof participantsInputMessageSchema>
  ): Promise<void> {
    try {
      const roomId = message.content.roomId;
      if (!roomId) return;

      const connections = wsServer.getRooms().get(roomId);
      const count = connections?.size || 0;

      await wsServer.broadcastParticipantsToRoom({ roomId, count });
    } catch (error) {
      console.error(`Failed to handle participants message:`, error);
      await wsServer.sendSystemMessage(
        client,
        'Failed to handle participants message',
        true,
        message
      );
    }
  }

  async handleSubscribeRoom(
    client: WebSocket,
    message: z.infer<typeof subscribeRoomInputMessageSchema>
  ): Promise<void> {
    try {
      if (!message.content?.roomId) {
        await wsServer.sendSystemMessage(
          client,
          'Subscribe message needs content.room_id',
          true,
          message
        );
        return;
      }

      const roomId = message.content.roomId;

      // Check if room exists
      const { error } = await supabase.from('rooms').select('*').eq('id', roomId).single();

      if (error) {
        await wsServer.sendSystemMessage(client, 'Room does not exist', true, message);
        return;
      }

      // Initialize room if needed
      const rooms = wsServer.getRooms();
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      // Add connection to room
      const room = rooms.get(roomId)!;
      room.add(client);
      wsServer.getClientInfo().set(client, { roomId });

      // Update participant count in database
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ participants: room.size })
        .eq('id', roomId);

      if (updateError) {
        console.error('Failed to update participant count:', updateError);
      }

      await wsServer.sendSystemMessage(client, 'Subscribed to room', false, message);
      await wsServer.broadcastParticipantsToRoom({ roomId: roomId, count: room.size });
    } catch (error) {
      console.error(`Failed to handle subscribe room message:`, error);
      await wsServer.sendSystemMessage(
        client,
        'Failed to handle subscribe room message',
        true,
        message
      );
    }
  }

  async handleGmMessage(
    client: WebSocket,
    message: z.infer<typeof gmMessageInputSchema>
  ): Promise<void> {
    const { error } = await processGmMessage(message);
    if (error) {
      console.error('Error processing GM message:', error);
      await wsServer.sendSystemMessage(client, error, true, message);
    }
    await wsServer.sendSystemMessage(client, 'GM Message processed and stored', false, message);
  }

  async broadcastToPublicChat(params: {
    roomId: number;
    record: Database['public']['Tables']['round_user_messages']['Insert'];
    excludeConnection?: WebSocket;
  }): Promise<void> {
    const { roomId, record, excludeConnection } = params;

    // First insert the message into the database
    const { error } = await supabase.from('round_user_messages').insert(record);

    if (error) {
      console.error('Failed to insert message into round_user_messages:', JSON.stringify(error));
    }

    await wsServer.sendMessageToRoom({
      roomId,
      message: record.message,
      excludeConnection,
    });
  }

  async broadcastToAiChat(params: {
    roomId: number;
    record: Database['public']['Tables']['round_agent_messages']['Insert'];
    excludeConnection?: WebSocket;
  }): Promise<void> {
    const { roomId, record, excludeConnection } = params;

    console.log(`Inserting into round_agent_messages (${record.message_type})`, record);

    // First insert the message into the database
    const { error } = await supabase.from('round_agent_messages').insert(record);
    if (error) {
      console.error('Failed to insert message into round_agent_messages:', error);
      throw new Error('Failed to insert message into round_agent_messages: ' + error);
    }

    await wsServer.sendMessageToRoom({
      roomId,
      message: record.message,
      excludeConnection,
    });
  }
}

export const wsOps = new WSOperations();
