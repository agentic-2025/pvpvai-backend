import { WebSocket } from 'ws';
import { supabase } from '../config';
import {
  HeartbeatContent,
  PublicChatContent,
  AIChatContent,
  GMMessageContent,
  SystemNotificationContent,
  WSMessageInput,
  WSMessageOutput,
  WsMessageType,
} from '../types/ws';

// Types for room management
type RoomMap = Map<number, Map<number, Set<WebSocket>>>;
type ClientInfo = Map<WebSocket, { userId: number; roomId: number }>;
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
    setInterval(() => this.cleanupStaleUserRooms(), 5 * 60 * 1000);
  }

  private sendSystemMessage(
    client: WebSocket,
    text: string,
    error: boolean = false,
    originalMessage?: any
  ): void {
    client.send(
      JSON.stringify({
        type: 'system_notification' as const,
        timestamp: Date.now(),
        signature: '',
        content: {
          text,
          error,
          originalMessage,
        } as SystemNotificationContent,
      })
    );
  }

  //TODO Add retry logic
  async broadcastToRoom(
    roomId: number,
    message: WSMessageOutput,
    excludeUserId?: number //You don't want to forward the message to the user that sent it
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(message);
    const sendPromises: Promise<void>[] = [];

    room.forEach((connections, userId) => {
      if (userId !== excludeUserId) {
        connections.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            sendPromises.push(
              new Promise<void>((resolve, reject) => {
                console.log(`Sending message to user ${userId} in room ${roomId}:`, messageString);
                client.send(messageString, (err: any) => {
                  if (err) reject(err);
                  else resolve();
                });
              }).catch((err) => {
                console.error(`Failed to send message to user ${userId} in room ${roomId}:`, err);
              })
            );
          }
        });
      }
    });

    await Promise.all(sendPromises);
  }

  async handlePublicChat(client: WebSocket, message: WSMessageInput): Promise<void> {
    const { roomId, roundId, text } = message.content as PublicChatContent;
    if (!roomId || !roundId || !text || !message.author) {
      this.sendSystemMessage(
        client,
        'Invalid public chat message, needs content.room_id, content.round_id, content.text, and author',
        true,
        message
      );
      return;
    }

    // Check room and round exist with a join query
    const { data: roundData, error: joinError } = await supabase
      .from('rounds')
      .select(`*,rooms!inner(*)`)
      .eq('id', roundId)
      .eq('rooms.id', roomId)
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
        user_id: message.author,
        message: {
          text: text,
        },
      })
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to save message from user ${message.author} in round ${message.content.roundId}:`,
        error
      );
      this.sendSystemMessage(client, `Failed to save message: ${error.message}`, true);
      return;
    }

    // Broadcast to all participants concurrently
    await this.broadcastToRoom(
      roomId,
      {
        type: WsMessageType.PUBLIC_CHAT,
        timestamp: Date.now(),
        signature: '',
        content: {
          message_id: data.id,
          timestamp: message.timestamp,
          author: message.author,
          roomId: roomId,
          roundId: roundId,
          text: text,
        } as PublicChatContent,
      },
      message.author
    );
    console.log(
      `Message #${data.id} from user ${message.author} broadcasted to room #${message.content.roomId}`
    );
  }

  async handleGMChat(client: WebSocket, message: WSMessageInput): Promise<void> {
    const { roomId, roundId, content, gmId } = message.content as GMMessageContent;
    const { text } = content;
    if (!roomId || !roundId || !text || !gmId) {
      this.sendSystemMessage(
        client,
        'Invalid public chat message, needs content.room_id, content.round_id, content.text, and content.gmId',
        true,
        message
      );
      return;
    }

    // Check room and round exist with a join query
    const { data: roundData, error: joinError } = await supabase
      .from('rounds')
      .select(`*,rooms!inner(*)`)
      .eq('id', roundId)
      .eq('rooms.id', roomId)
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
      .from('round_agent_messages')
      .insert({
        round_id: roundId,
        agent_id: gmId,
        message_type: message.type,
        message: {
          text: content.text,
        },
      })
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to save message from agent ${message.author} in round ${message.content.roundId}:`,
        error
      );
      this.sendSystemMessage(client, `Failed to save message: ${error.message}`, true);
      return;
    }

    // Broadcast to all participants concurrently
    await this.broadcastToRoom(
      roomId,
      {
        type: WsMessageType.GM_ACTION,
        timestamp: Date.now(),
        signature: '',
        content: {
          messageId: data.id,
          gmId: message.author,
          roomId: roomId,
          roundId: roundId,
          content: {
            text: text,
          }
        } as GMMessageContent,
      },
      message.author
    );
    console.log(
      `Message #${data.id} from GM ${message.author} broadcasted to room #${message.content.roomId}`
    );
  }

  //Happens when a user enters a room in the frontend.
  async handleSubscribeRoom(client: WebSocket, message: WSMessageInput): Promise<void> {
    if (!message.content?.roomId || !message.author) {
      this.sendSystemMessage(
        client,
        'Subscribe message needs content.room_id and author', //TODO should not require author
        true,
        message
      );
      return;
    }

    // Check if room exists on Database
    const { error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', message.content.roomId)
      .single();

    if (error) {
      this.sendSystemMessage(client, 'Room does not exist or hit error', true, message);
      return; // Add return here to prevent subscribing to non-existent room
    }

    //Add user to user_rooms, don't error if it already exists
    const { error: userRoomError } = await supabase.from('user_rooms').upsert(
      {
        user_id: message.author,
        room_id: message.content.roomId,
      },
      {
        onConflict: 'user_id,room_id',
      }
    );

    if (userRoomError) {
      console.error('Error upserting user_room:', userRoomError);
      this.sendSystemMessage(
        client,
        'Failed to register user in room: ' + userRoomError.message,
        true
      );
      return;
    }

    // Initialize room mapping (local cache) entry if it doesn't exist
    if (!this.rooms.has(message.content.roomId)) {
      this.rooms.set(message.content.roomId, new Map());
    }

    const room = this.rooms.get(message.content.roomId)!;

    // Initialize user's connection set if it doesn't exist
    if (!room.has(message.author)) {
      room.set(message.author, new Set());
    }

    // Add this connection to user's set
    room.get(message.author)!.add(client);

    // Store client info for cleanup
    this.clientInfo.set(client, {
      userId: message.author,
      roomId: message.content.roomId,
    });
    console.log(`Subscribed user ${message.author} to room #${message.content.roomId}`);

    // Only broadcast join message if this is the user's first connection
    const userConnections = room.get(message.author)!;
    if (userConnections.size === 1) {
      await this.broadcastToRoom(message.content.roomId, {
        type: WsMessageType.SYSTEM_NOTIFICATION,
        timestamp: Date.now(),
        signature: '',
        content: {
          text: `${message.author} has joined the room`,
          error: false,
          roomId: message.content.roomId,
        } as SystemNotificationContent,
      });
    }
  }

  //Happens when a user leaves a room in the frontend
  handleUnsubscribeRoom(client: WebSocket, message: WSMessageInput): void {
    if (!message.content.roomId || !message.author) return;

    const room = this.rooms.get(message.content.roomId);
    if (!room) return;

    const userConnections = room.get(message.author);
    if (!userConnections) return;

    this.removeClientFromRoom(client, message.author, message.content.roomId);
    console.log(
      `Unsubscribed user ${message.author} connection from room #${
        message.content.roomId
      }. Remaining connections: ${room.get(message.author)?.size || 0}`
    );
  }

  handleHeartbeat(client: WebSocket): void {
    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
    const info = this.clientInfo.get(client);
    if (info) {
      console.log(`Received heartbeat from user ${info.userId} in room #${info.roomId}`);
    }
  }

  setupHeartbeat(client: WebSocket): NodeJS.Timeout {
    return setInterval(() => {
      if (this.clientHeartbeats.has(client)) {
        client.close(1000, 'Heartbeat missed');
        this.cleanup(client);
      }

      client.send(
        JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now(),
          signature: '',
          content: {} as HeartbeatContent,
        })
      );

      this.clientHeartbeats.set(
        client,
        setTimeout(() => {
          client.close(1000, 'Heartbeat timeout');
        }, this.HEARTBEAT_TIMEOUT)
      );
    }, this.HEARTBEAT_TIMEOUT * 3) as NodeJS.Timeout;
  }

  // Cleanup function for when a user leaves a room or otherwise disconnects from the server
  // Clears their connection from the room and removes their heartbeat timeout
  cleanup(client: WebSocket): void {
    const info = this.clientInfo.get(client);
    if (info) {
      this.removeClientFromRoom(client, info.userId, info.roomId);
      console.log(`Cleaned up connection for user ${info.userId} from room #${info.roomId}`);
    }

    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
  }

  private async removeClientFromRoom(
    client: WebSocket,
    userId: number,
    roomId: number
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      const userConnections = room.get(userId);
      if (userConnections) {
        userConnections.delete(client);
        console.log(
          `Removed connection for user ${userId} from room #${roomId}. ${userConnections.size} connections remaining`
        );

        if (userConnections.size === 0) {
          room.delete(userId);
          console.log(`User ${userId} has no more connections in room #${roomId}`);
          //Remove user from user_rooms
          const { error } = await supabase
            .from('user_rooms')
            .delete()
            .eq('user_id', userId)
            .eq('room_id', roomId);
          if (error) {
            console.error(`Error deleting user ${userId} from room ${roomId}:`, error);
          }
          // Send message to all users in the room that the user has left
          await this.broadcastToRoom(roomId, {
            type: WsMessageType.SYSTEM_NOTIFICATION,
            timestamp: Date.now(),
            signature: '',
            content: {
              text: `${userId} has left the room`,
              error: false,
              roomId: roomId,
            } as SystemNotificationContent,
          });
        }
        if (room.size === 0) {
          this.rooms.delete(roomId);
          console.log(`Room #${roomId} has no more users, removed from memory`);
        }
      }
    }
    this.clientInfo.delete(client);
  }

  // Clean up stale user_rooms records
  private async cleanupStaleUserRooms(): Promise<void> {
    try {
      // Get all user_rooms records
      const { data: userRooms, error } = await supabase.from('user_rooms').select('*');

      if (error) {
        console.error('Error fetching user_rooms for cleanup:', error);
        return;
      }

      // Build set of active user-room pairs from memory
      const activeConnections = new Set<string>();
      this.rooms.forEach((users, roomId) => {
        users.forEach((connections, userId) => {
          if (connections.size > 0) {
            activeConnections.add(`${userId}-${roomId}`);
          }
        });
      });

      // Find stale records
      const staleRecords = userRooms.filter(
        (record) => !activeConnections.has(`${record.user_id}-${record.room_id}`)
      );

      if (staleRecords.length === 0) {
        return;
      }

      // Delete stale records - handle each record individually to avoid type issues
      for (const record of staleRecords) {
        const { error: deleteError } = await supabase
          .from('user_rooms')
          .delete()
          .eq('user_id', record.user_id)
          .eq('room_id', record.room_id);

        if (deleteError) {
          console.error(
            `Error deleting stale user_room record (user: ${record.user_id}, room: ${record.room_id}):`,
            deleteError
          );
        }
      }

      console.log(`Cleaned up ${staleRecords.length} stale user_rooms records`);
    } catch (err) {
      console.error('Error in cleanupStaleUserRooms:', err);
    }
  }
}
