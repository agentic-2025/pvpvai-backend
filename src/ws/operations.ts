// src/ws/ws-operations.ts

import WebSocket from 'ws';
import { supabase } from '../config';
import type {
  HeartbeatContent,
  PublicChatContent,
  SystemNotificationContent,
  WSMessageInput,
  WSMessageOutput,
  AIChatContent,
  PVPMessageContent,
  GMMessageContent,
  DbResult,
  SingleDbResult
} from '../types/ws';

type RoomMap = Map<number, Map<number, Set<WebSocket>>>;
type ClientInfo = Map<WebSocket, { 
  userId: number; 
  roomId: number;
  isGameMaster?: boolean;
}>;
type HeartbeatMap = Map<WebSocket, NodeJS.Timeout>;

export class WSOperations {
  private rooms: RoomMap;
  private clientInfo: ClientInfo;
  private clientHeartbeats: HeartbeatMap;
  private readonly HEARTBEAT_TIMEOUT = 10000;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  constructor() {
    this.rooms = new Map();
    this.clientInfo = new Map();
    this.clientHeartbeats = new Map();
    setInterval(() => this.cleanupStaleUserRooms(), this.CLEANUP_INTERVAL);
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = this.MAX_RETRIES,
    delay = this.RETRY_DELAY
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      // Handle Supabase duplicate key violations gracefully
      if (this.isDuplicateKeyError(error)) {
        return { data: null, error: null } as T;
      }

      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryOperation(operation, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  // Helper to identify duplicate key errors
  private isDuplicateKeyError(error: unknown): boolean {
    return Boolean(  // Fix: Cast to boolean
      error && 
      typeof error === 'object' && 
      'code' in error && 
      error.code === '23505'
    );
  }

  private sendSystemMessage(
    client: WebSocket,
    text: string,
    error: boolean = false,
    roomId?: number,
    originalMessage?: any
  ): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'system_notification' as const,
          timestamp: Date.now(),
          signature: '',
          content: {
            text,
            error,
            roomId,
            originalMessage,
          } as SystemNotificationContent,
        })
      );
    }
  }

  private validateMessage(message: WSMessageInput): boolean {
    if (!message.type || !message.content || !message.author) {
      console.error('Missing required message fields');
      return false;
    }

    if (!message.content.roomId) {
      console.error('Missing roomId in message content');
      return false;
    }

    switch (message.type) {
      case 'ai_chat':
        return Boolean(message.content.text);
      case 'pvp_action':
        return Boolean(
          message.content.actionType &&
          Array.isArray(message.content.targets) &&
          message.content.targets.length > 0 &&
          ['Silence', 'Deafen', 'Attack', 'Poison'].includes(message.content.actionType)
        );
      case 'gm_action':
        return Boolean(message.content.text);
      default:
        return true;
    }
  }

  async broadcastToRoom(
    roomId: number,
    message: WSMessageOutput,
    excludeUserId?: number
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(message);
    const sendPromises: Promise<void>[] = [];

    // First send to GameMaster if exists
    room.forEach((connections, userId) => {
      connections.forEach((client) => {
        const clientInfo = this.clientInfo.get(client);
        if (clientInfo?.isGameMaster && client.readyState === WebSocket.OPEN) {
          sendPromises.push(
            this.retryOperation(() => 
              new Promise<void>((resolve, reject) => {
                client.send(messageString, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              })
            ).catch((err) => {
              console.error(`Failed to send message to GM in room ${roomId}:`, err);
            })
          );
        }
      });
    });

    // Then send to other clients
    room.forEach((connections, userId) => {
      if (userId !== excludeUserId) {
        connections.forEach((client) => {
          const clientInfo = this.clientInfo.get(client);
          if (!clientInfo?.isGameMaster && client.readyState === WebSocket.OPEN) {
            sendPromises.push(
              this.retryOperation(() =>
                new Promise<void>((resolve, reject) => {
                  client.send(messageString, (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                })
              ).catch((err) => {
                console.error(`Failed to send message to user ${userId} in room ${roomId}:`, err);
              })
            );
          }
        });
      }
    });

    await Promise.all(sendPromises);
  }

  async handleAIChat(client: WebSocket, message: WSMessageInput): Promise<void> {
    if (!this.validateMessage(message)) {
      this.sendSystemMessage(
        client,
        'Invalid AI chat message format',
        true,
        message.content?.roomId,
        message
      );
      return;
    }

    const { roomId, roundId, text } = message.content;
    if (!roomId || !text || !message.author) {
      this.sendSystemMessage(
        client,
        'Invalid AI chat message: missing roomId, text, or author',
        true,
        roomId,
        message
      );
      return;
    }

    // Get current round if roundId not provided
    let finalRoundId = roundId;
    if (!finalRoundId) {
      const response = await supabase
        .from('rounds')
        .select('id')
        .eq('room_id', roomId)
        .eq('active', true)
        .single();

      if (!response.data || response.error) {
        this.sendSystemMessage(client, 'No active round found', true, roomId);
        return;
      }
      finalRoundId = response.data.id;
    }

    // Store message in database
    const result = await this.retryOperation(async () => await
      supabase
        .from('round_agent_messages')
        .insert({
          round_id: finalRoundId,
          agent_id: message.author || 0,
          message: {
            text: text,
            timestamp: message.timestamp
          }
        })
        .select()
        .single()
    );

    if (result.error || !result.data) {
      console.error(`Failed to save AI message:`, result.error);
      this.sendSystemMessage(client, `Failed to save message: ${result.error?.message}`, true, roomId);
      return;
    }

    await this.broadcastToRoom(
      roomId,
      {
        type: 'ai_chat',
        timestamp: Date.now(),
        signature: '',
        content: {
          message_id: result.data.id,
          timestamp: message.timestamp,
          author: message.author,
          roomId,
          roundId: finalRoundId,
          text: message.content.text,
        } as AIChatContent
      },
      message.author
    );
  }

  async handlePvPAction(client: WebSocket, message: WSMessageInput): Promise<void> {
    if (!this.validateMessage(message)) {
      this.sendSystemMessage(
        client,
        'Invalid PvP action format',
        true,
        message.content?.roomId,
        message
      );
      return;
    }

    const { roomId, actionType, targets } = message.content;
    
    if (!roomId || !actionType || !targets || !message.author) {
      this.sendSystemMessage(
        client,
        'Invalid PvP action: missing required fields',
        true,
        roomId,
        message
      );
      return;
    }

    const validActions = ['Silence', 'Deafen', 'Poison'];
    if (!validActions.includes(actionType)) {
      this.sendSystemMessage(
        client,
        `Invalid PvP action type: ${actionType}`,
        true,
        roomId
      );
      return;
    }

    // Store PvP action in database
    const response = await this.retryOperation(async () => await
      supabase.from('rounds')
        .update({
          pvp_action_log: `pvp_action_log || ${JSON.stringify({
            timestamp: message.timestamp,
            actor: message.author,
            action: actionType,
            targets
          })}`
        })
        .eq('room_id', roomId)
        .eq('active', true)
    );

    if (response.error || !response.data) {
      console.error('Failed to log PvP action:', response.error);
      this.sendSystemMessage(client, 'Failed to record PvP action', true, roomId);
      return;
    }

    await this.broadcastToRoom(
      roomId,
      {
        type: 'pvp_action',
        timestamp: Date.now(),
        signature: '',
        content: {
          actionType,
          targets,
          actor: message.author?.toString(), // Convert to string
          roomId
        } as PVPMessageContent
      }
    );
  }

  async handleGMAction(client: WebSocket, message: WSMessageInput): Promise<void> {
    if (!this.validateMessage(message)) {
      this.sendSystemMessage(
        client,
        'Invalid GM action format',
        true,
        message.content?.roomId,
        message
      );
      return;
    }

    const { roomId, text, targets } = message.content;
    const clientInfo = this.clientInfo.get(client);

    if (!clientInfo?.isGameMaster) {
      this.sendSystemMessage(client, 'Unauthorized: not a GameMaster', true);
      return;
    }

    if (!roomId || !text || !message.author) {
      this.sendSystemMessage(
        client,
        'Invalid GM action: missing required fields',
        true,
        roomId,
        message
      );
      return;
    }

    // Log GM action
    const response = await this.retryOperation(async () => await
      supabase.from('rounds')
        .update({
          game_master_action_log: `game_master_action_log || ${JSON.stringify({
            timestamp: message.timestamp,
            action: text,
            targets: targets || []
          })}`
        })
        .eq('room_id', roomId)
        .eq('active', true)
    );

    if (response.error || !response.data) {
      console.error('Failed to log GM action:', response.error);
      this.sendSystemMessage(client, 'Failed to record GM action', true, roomId);
      return;
    }

    await this.broadcastToRoom(
      roomId,
      {
        type: 'gm_action',
        timestamp: Date.now(),
        signature: '',
        content: {
          text,
          gm_id: (message.author || 0).toString(),
          targets: targets || [],
          roomId
        } as GMMessageContent
      }
    );
  }

  async handleSubscribeRoom(client: WebSocket, message: WSMessageInput): Promise<void> {
    if (!this.validateMessage(message)) {
      this.sendSystemMessage(
        client,
        'Invalid subscription message format',
        true
      );
      return;
    }

    try {
      if (!message.content?.roomId || !message?.author) {
        this.sendSystemMessage(client, 'Missing roomId or author', true);
        return;
      }
  
      const userId = message.author;
      const roomId = message.content.roomId;

      // Check if room exists and get GM info first
      const roomResponse = await supabase
        .from('rooms')
        .select('id, game_master_id')
        .eq('id', roomId)
        .single();
  
      if (roomResponse.error || !roomResponse.data) {
        this.sendSystemMessage(client, 'Room does not exist', true);
        return;
      }

      // Fix: Determine isGameMaster early
      const isGameMaster = roomResponse.data.game_master_id === userId;
  
      // First ensure the user exists if not GM
      if (!isGameMaster) {
        const userResponse = await this.retryOperation(async () => await
          supabase
            .from('users')
            .upsert({
              id: userId,
              address: userId.toString(),
              chain_id: '1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id'
            })
            .select()
            .single()
        );
    
        if (userResponse.error || !userResponse.data) {
          console.error('Error upserting user:', userResponse.error);
          this.sendSystemMessage(client, 'Failed to register user', true);
          return;
        }
      }

      // Add user-room relationship with duplicate handling
      if (!isGameMaster) {
        await this.retryOperation(async () => {
          const { error } = await supabase
            .from('user_rooms')
            .upsert({
              user_id: userId,
              room_id: roomId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,room_id',
              ignoreDuplicates: true // Ignore duplicate inserts
            });
          
          if (error && !this.isDuplicateKeyError(error)) {
            throw error;
          }
        });
      }
  
      // Setup room mapping
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Map());
      }
  
      const room = this.rooms.get(roomId)!;
      if (!room.has(userId)) {
        room.set(userId, new Set());
      }
  
      room.get(userId)!.add(client);
      
      this.clientInfo.set(client, {
        userId: userId,
        roomId: roomId,
        isGameMaster
      });
  
      console.log(`Subscribed ${isGameMaster ? 'GM' : 'user'} ${userId} to room #${roomId}`);
  
      // Announce join for first connection only
      const userConnections = room.get(userId)!;
      if (userConnections.size === 1) {
        await this.broadcastToRoom(
          roomId,
          {
            type: 'system_notification',
            timestamp: Date.now(),
            signature: '',
            content: {
              text: `${userId} has joined the room`,
              error: false,
              roomId: roomId
            } as SystemNotificationContent
          }
        );
      }
    } catch (error: unknown) {
      console.error('Error in handleSubscribeRoom:', error);
      this.sendSystemMessage(
        client,
        this.getErrorMessage(error), // Extract message safely
        true
      );
      // Don't re-throw, handle error here
    }
  }

  // Helper for safe error message extraction
  private getErrorMessage(error: unknown): string {
    return error && 
           typeof error === 'object' && 
           'message' in error ? 
           String(error.message) : 
           'An unexpected error occurred';
  }

  handleHeartbeat(client: WebSocket): void {
    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
    
    const info = this.clientInfo.get(client);
    if (info) {
      console.log(`Received heartbeat from ${info.isGameMaster ? 'GM' : 'user'} ${info.userId} in room #${info.roomId}`);
    }
  }

  setupHeartbeat(client: WebSocket): NodeJS.Timeout {
    return setInterval(() => {
      if (this.clientHeartbeats.has(client)) {
        client.close(1000, 'Heartbeat missed');
        this.cleanup(client);
      }

      if (client.readyState === WebSocket.OPEN) {
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
      }
    }, this.HEARTBEAT_TIMEOUT * 3);
  }

  handleUnsubscribeRoom(client: WebSocket, message: WSMessageInput): void {
    if (!message.content.roomId || !message.author) return;

    const room = this.rooms.get(message.content.roomId);
    if (!room) return;

    const userConnections = room.get(message.author);
    if (!userConnections) return;

    this.removeClientFromRoom(client, message.author, message.content.roomId);
  }

  cleanup(client: WebSocket): void {
    const info = this.clientInfo.get(client);
    if (info) {
      this.removeClientFromRoom(client, info.userId, info.roomId);
      console.log(`Cleaned up ${info.isGameMaster ? 'GM' : 'user'} ${info.userId} from room #${info.roomId}`);
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
    if (!room) return;

    const userConnections = room.get(userId);
    if (!userConnections) return;

    userConnections.delete(client);
    console.log(
      `Removed connection for user ${userId} from room #${roomId}. ${userConnections.size} connections remaining`
    );

    if (userConnections.size === 0) {
      room.delete(userId);
      console.log(`User ${userId} has no more connections in room #${roomId}`);

      // Remove user from user_rooms
      const response = await this.retryOperation(async () => await
        supabase
          .from('user_rooms')
          .delete()
          .eq('user_id', userId)
          .eq('room_id', roomId)
      );

      if (response.error || !response.data) {
        console.error(`Error deleting user ${userId} from room ${roomId}:`, response.error);
      }

      // Notify room about user leaving
      await this.broadcastToRoom(roomId, {
        type: 'system_notification',
        timestamp: Date.now(),
        signature: '',
        content: {
          text: `User ${userId} has left the room`,
          error: false,
          roomId: roomId,
        } as SystemNotificationContent,
      });
    }

    if (room.size === 0) {
      this.rooms.delete(roomId);
      console.log(`Room #${roomId} has no more users, removed from memory`);
    }

    this.clientInfo.delete(client);
  }

  private async cleanupStaleUserRooms(): Promise<void> {
    try {
      // Get all user_rooms records
      const response = await this.retryOperation(async () => await
        supabase.from('user_rooms').select('*')
      );

      if (!response.data || response.error) {
        console.error('Error fetching user_rooms for cleanup:', response.error?.message);
        return;
      }

      // Build set of active user-room pairs
      const activeConnections = new Set<string>();
      this.rooms.forEach((users, roomId) => {
        users.forEach((connections, userId) => {
          if (connections.size > 0) {
            activeConnections.add(`${userId}-${roomId}`);
          }
        });
      });

      // Find and remove stale records
      type UserRoom = { user_id: number; room_id: number };
const staleRecords = (response.data as UserRoom[]).filter(
        (record) => !activeConnections.has(`${record.user_id}-${record.room_id}`)
      );

      if (staleRecords.length === 0) return;

      // Delete stale records with retries
      for (const record of staleRecords) {
        await this.retryOperation(async () => await
          supabase
            .from('user_rooms')
            .delete()
            .eq('user_id', record.user_id)
            .eq('room_id', record.room_id)
        ).catch(error => {
          console.error(
            `Error deleting stale user_room record (user: ${record.user_id}, room: ${record.room_id}):`,
            error
          );
        });
      }

      console.log(`Cleaned up ${staleRecords.length} stale user_rooms records`);
    } catch (err) {
      console.error('Error in cleanupStaleUserRooms:', err);
    }
  }
}

