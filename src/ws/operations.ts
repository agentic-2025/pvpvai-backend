import { WebSocket } from 'ws';
import { supabase } from '../config';
import {
  HeartbeatOutputMessage,
  ParticipantsInputMessage,
  ParticipantsOutputMessage,
  PublicChatInputMessage,
  SubscribeRoomInputMessage,
  SystemNotificationOutputMessage,
  WsMessageInputTypes,
  WsMessageOutputTypes,
  WsRoomLevelOutputTypes,
} from '../types/ws';
import { Tables } from '../types/database.types';
// Types for room management
type RoomMap = Map<number, Set<WebSocket>>;
type ClientInfo = Map<WebSocket, { roomId: number }>;
type HeartbeatMap = Map<WebSocket, NodeJS.Timeout>;

export class WSOperations {
  private rooms: RoomMap;
  private clientInfo: ClientInfo;
  private clientHeartbeats: HeartbeatMap;
  private readonly HEARTBEAT_TIMEOUT = 10000;

  constructor() {
    this.rooms = new Map();
    this.clientInfo = new Map();
    this.clientHeartbeats = new Map();

    // Run cleanup every 5 minutes
    setInterval(() => this.syncParticipantCounts(), 5 * 60 * 1000);
  }

  private sendSystemMessage(
    client: WebSocket,
    text: string,
    error: boolean = false,
    originalMessage?: any
  ): void {
    const message: SystemNotificationOutputMessage = {
      type: WsMessageOutputTypes.SYSTEM_NOTIFICATION_OUTPUT,
      timestamp: Date.now(),
      content: {
        text,
        error,
        originalMessage,
      },
    };
    client.send(JSON.stringify(message));
  }

  async broadcastToPublicChat(params: {
    roomId: number,
    message: Tables<'round_user_messages'>,
    excludeConnection?: WebSocket
  }): Promise<void> {
    const { roomId, message, excludeConnection } = params;

    // First insert the message into the database
    const { error } = await supabase
      .from('round_user_messages')
      .insert(message);

    if (error) {
      console.error('Failed to insert message into round_user_messages:', error);
      return;
    }

    // Then broadcast to room participants
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(message.message);
    const sendPromises: Promise<void>[] = [];

    room.forEach((client) => {
      if (client !== excludeConnection && client.readyState === WebSocket.OPEN) {
        sendPromises.push(
          new Promise<void>((resolve, reject) => {
            console.log(`Sending public chat message to client in room ${roomId}:`, messageString);
            client.send(messageString, (err: any) => {
              if (err) reject(err);
              else resolve();
            });
          }).catch((err) => {
            console.error(`Failed to send public chat message to client in room ${roomId}:`, err);
          })
        );
      }
    });

    await Promise.all(sendPromises);
  }

  //TODO Add retry logic
  async broadcastToAiChat(params: {
    roomId: number,
    record: Tables<'round_agent_messages'>,
    excludeConnection?: WebSocket
  }): Promise<void> {
    const { roomId, record, excludeConnection } = params;

    // First insert the message into the database
    const { error } = await supabase
      .from('round_agent_messages')
      .insert(record);

    if (error) {
      console.error('Failed to insert message into round_agent_messages:', error);
    }

    // Then broadcast to room participants
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(record.message);
    const sendPromises: Promise<void>[] = [];

    room.forEach((client) => {
      if (client !== excludeConnection && client.readyState === WebSocket.OPEN) {
        sendPromises.push(
          new Promise<void>((resolve, reject) => {
            console.log(`Sending message to client in room ${roomId}:`, messageString);
            client.send(messageString, (err: any) => {
              if (err) reject(err);
              else resolve();
            });
          }).catch((err) => {
            console.error(`Failed to send message to client in room ${roomId}:`, err);
          })
        );
      }
    });

    await Promise.all(sendPromises);
  }

  async handlePublicChat(client: WebSocket, message: PublicChatInputMessage): Promise<void> {
    //TODO implement signature auth here, sending a message requires the user to be logged in.
    const { roundId, userId, text } = message.content;

    // Check room and round exist with a join query
    const { data: roundData, error: joinError } = await supabase
      .from('rounds')
      .select(`*`)
      .eq('id', roundId)
      .single();

    if (joinError) {
      this.sendSystemMessage(client, 'Invalid room or round ID provided', true, message);
      return;
    }

    // Check if round is active
    if (!roundData.active) {
      this.sendSystemMessage(
        client,
        'This round is not active - messages cannot be added',
        true,
        message
      );
      return;
    }

    // Store message in database
    const { data, error } = await supabase
      .from('round_user_messages')
      .insert({
        round_id: roundId,
        user_id: userId,
        message: {
          text: text,
        },
      })
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to save message from user ${userId} (${message.sender}) in round ${roundId}:`,
        error
      );
      this.sendSystemMessage(client, `Failed to save message: ${error.message}`, true);
      return;
    }

    // Broadcast to all participants concurrently
    await this.broadcastToAiChat(roundData.room_id, message, client);
    console.log(
      `Message #${data.id} from user ${userId} (${message.sender}) broadcasted to room #${roundData.room_id}`
    );
  }

  // Add new method to handle participant count messages
  async handleParticipants(message: ParticipantsInputMessage): Promise<void> {
    const roomId = message.content.roomId;
    if (!roomId) return;

    const connections = this.rooms.get(roomId);
    const count = connections?.size || 0;

    await this.broadcastToAiChat(roomId, {
      type: WsMessageOutputTypes.PARTICIPANTS_OUTPUT,
      timestamp: Date.now(),
      content: {
        timestamp: Date.now(),
        roomId,
        count,
      },
    } as ParticipantsOutputMessage);
  }

  // Update subscribe room handler
  async handleSubscribeRoom(client: WebSocket, message: SubscribeRoomInputMessage): Promise<void> {
    if (!message.content?.roomId) {
      this.sendSystemMessage(client, 'Subscribe message needs content.room_id', true, message);
      return;
    }

    const roomId = message.content.roomId;

    // Check if room exists
    const { error } = await supabase.from('rooms').select('*').eq('id', roomId).single();

    if (error) {
      this.sendSystemMessage(client, 'Room does not exist', true, message);
      return;
    }

    // Initialize room if needed
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    // Add connection to room
    const room = this.rooms.get(roomId)!;
    room.add(client);
    this.clientInfo.set(client, { roomId });

    // Update participant count in database
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ participants: room.size })
      .eq('id', roomId);

    if (updateError) {
      console.error('Failed to update participant count:', updateError);
    }

    // Broadcast new participant count
    await this.broadcastToAiChat(roomId, {
      agent_id: :, 
      
      {
      type: WsMessageOutputTypes.PARTICIPANTS_OUTPUT,
      timestamp: Date.now(),
      content: {
        roomId,
        count: room.size,
      },
    } as ParticipantsOutputMessage);

    await this.sendSystemMessage(client, 'Subscribed to room', false, message);
  }

  // Update unsubscribe room handler
  async handleUnsubscribeRoom(client: WebSocket): Promise<void> {
    const info = this.clientInfo.get(client);
    if (!info) return;

    await this.removeClientFromRoom(client, info.roomId);
  }

  // Update remove client method
  private async removeClientFromRoom(client: WebSocket, roomId: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.delete(client);
    this.clientInfo.delete(client);

    if (room.size === 0) {
      this.rooms.delete(roomId);
    }

    // Update participant count in database
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ participants: room.size })
      .eq('id', roomId);

    if (updateError) {
      console.error('Failed to update participant count:', updateError);
    }

    // Broadcast new participant count
    await this.broadcastToAiChat(roomId, {
      type: WsMessageOutputTypes.PARTICIPANTS_OUTPUT,
      timestamp: Date.now(),
      content: {
        roomId,
        count: room.size,
      },
    } as ParticipantsOutputMessage);
  }

  // Add method to sync participant counts
  private async syncParticipantCounts(): Promise<void> {
    try {
      for (const [roomId, connections] of this.rooms.entries()) {
        const { error } = await supabase
          .from('rooms')
          .update({ participants: connections.size })
          .eq('id', roomId);

        if (error) {
          console.error(`Failed to sync participant count for room ${roomId}:`, error);
        }
      }
    } catch (err) {
      console.error('Error in syncParticipantCounts:', err);
    }
  }

  handleHeartbeat(client: WebSocket): void {
    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
    const info = this.clientInfo.get(client);
    if (info) {
      console.log(
        `Received heartbeat from client ${client.url || 'unknown'} in room ${info.roomId}`
      );
    }
  }

  setupHeartbeat(client: WebSocket): NodeJS.Timeout {
    return setInterval(() => {
      if (this.clientHeartbeats.has(client)) {
        client.close(1000, 'Heartbeat missed');
        this.cleanup(client);
      }

      const heartbeatMessage: HeartbeatOutputMessage = {
        type: WsMessageInputTypes.HEARTBEAT_INPUT,
        content: {},
      };
      client.send(JSON.stringify(heartbeatMessage));

      this.clientHeartbeats.set(
        client,
        setTimeout(() => {
          client.close(1000, 'Heartbeat timeout');
        }, this.HEARTBEAT_TIMEOUT)
      );
    }, this.HEARTBEAT_TIMEOUT * 3) as NodeJS.Timeout;
  }

  // Update cleanup method
  cleanup(client: WebSocket): void {
    const info = this.clientInfo.get(client);
    if (info) {
      this.removeClientFromRoom(client, info.roomId);
    }

    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
  }
}
