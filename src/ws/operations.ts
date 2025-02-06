import { WebSocket } from 'ws';
import { z } from 'zod';
import { SIGNATURE_WINDOW_MS, supabase } from '../config';
import { Database } from '../types/database.types';
import { WsMessageTypes } from '../types/ws';
import { verifySignedMessage } from '../utils/auth';
import { processGmMessage } from '../utils/messageHandler';
import {
  gmMessageInputSchema,
  heartbeatOutputMessageSchema,
  participantsInputMessageSchema,
  participantsOutputMessageSchema,
  publicChatMessageInputSchema,
  subscribeRoomInputMessageSchema,
  systemNotificationOutputSchema,
} from '../utils/schemas';
import { roundPreflight } from '../utils/validation';

export type RoomMap = Map<number, Set<WebSocket>>;
export type ClientInfo = Map<WebSocket, { roomId: number }>;
export type HeartbeatMap = Map<WebSocket, NodeJS.Timeout>;

interface ClientMetadata {
  roomId: number;
  lastActivity: number;
}

interface MessageType {
  messageType: WsMessageTypes;
  content: {
    timestamp: number;
    roundId: number;
    roomId: number;
    [key: string]: any;
  };
}

// Type guard to verify message structure
function isMessageType(message: unknown): message is MessageType {
  if (!message || typeof message !== 'object') return false;
  
  const msg = message as any;
  return (
    'messageType' in msg &&
    'content' in msg &&
    typeof msg.content === 'object' &&
    'timestamp' in msg.content &&
    'roundId' in msg.content &&
    'roomId' in msg.content
  );
}

export class WSOperations {
  private rooms: RoomMap;
  private clientInfo: Map<WebSocket, ClientMetadata>;
  private clientHeartbeats: HeartbeatMap;
  private readonly HEARTBEAT_TIMEOUT = 10000;
  private readonly MAX_RETRIES = 3;

  constructor() {
    this.rooms = new Map();
    this.clientInfo = new Map();
    this.clientHeartbeats = new Map();

    // Run cleanup every 5 minutes
    setInterval(() => this.syncParticipantCounts(), 5 * 60 * 1000);
  }

  async sendSystemMessage(
    client: WebSocket,
    text: string,
    error: boolean = false,
    originalMessage?: any
  ) {
    const message: z.infer<typeof systemNotificationOutputSchema> = {
      messageType: WsMessageTypes.SYSTEM_NOTIFICATION,
      content: {
        timestamp: Date.now(),
        text,
        error,
        originalMessage,
      },
    };
    client.send(JSON.stringify(message));
  }

  // TODO Some code duplication but it's cleanish
  // Inserts message into round_user_messages and broadcasts to all users in the room
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
      //Oh well, we tried (for now)
    }

    await this.sendMessageToRoom({
      roomId,
      message: record.message,
      excludeConnection,
    });
  }

  // Inserts message into round_agent_messages and broadcasts to all agents in the room
  async broadcastToAiChat(params: {
    roomId: number;
    record: Database['public']['Tables']['round_agent_messages']['Insert'];
    excludeConnection?: WebSocket;
  }): Promise<void> {
    try {
      const { roomId, record } = params;

      // Validate message format
      if (!record.message || !record.agent_id || !record.round_id) {
        throw new Error('Invalid message format');
      }

      // Validate and type-cast message
      if (!isMessageType(record.message)) {
        throw new Error('Invalid message structure');
      }

      const message = record.message;

      // Store in database with retries
      await this.retryOperation(async () => {
        const { error } = await supabase
          .from('round_agent_messages')
          .insert({
            ...record,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (error) throw error;
      });

      // Broadcast with proper format
      await this.sendMessageToRoom({
        roomId,
        message: {
          messageType: message.messageType,
          content: {
            ...message.content,
            timestamp: Date.now(),
            roundId: record.round_id,
            roomId
          }
        },
        excludeConnection: params.excludeConnection
      });

    } catch (error) {
      console.error('Error in broadcastToAiChat:', error);
      throw error;
    }
  }

  async broadcastParticipantsToRoom(params: { roomId: number; count: number }): Promise<void> {
    const { roomId, count } = params;
    const message: z.infer<typeof participantsOutputMessageSchema> = {
      messageType: WsMessageTypes.PARTICIPANTS,
      content: {
        timestamp: Date.now(),
        roomId,
        count,
      },
    };

    await this.sendMessageToRoom({ 
      roomId,
      message,
    });
  }

  public async sendMessageToRoom(params: {
    roomId: number;
    message: any;
    excludeConnection?: WebSocket;
  }): Promise<void> {
    const room = this.rooms.get(params.roomId);
    
    // Enhanced logging
    console.log(`Sending message to room ${params.roomId}:`, {
      hasRoom: !!room,
      connectionCount: room?.size || 0,
      messageType: params.message?.messageType,
    });

    if (!room || room.size === 0) {
      console.warn(
        `Room ${params.roomId} has no active connections, message will not be broadcast:`,
        params.message
      );
      return;
    }

    const messageString = JSON.stringify(params.message);
    const sendPromises: Promise<void>[] = [];
    const failedClients: WebSocket[] = [];

    room.forEach((client) => {
      if (client !== params.excludeConnection && client.readyState === WebSocket.OPEN) {
        sendPromises.push(
          new Promise<void>((resolve, reject) => {
            client.send(messageString, (err?: Error) => {
              if (err) {
                failedClients.push(client);
                reject(err);
              } else {
                resolve();
              }
            });
          }).catch((err) => {
            console.error(`Failed to send message to client in room ${params.roomId}:`, err);
          })
        );
      } else if (client.readyState !== WebSocket.OPEN) {
        failedClients.push(client);
      }
    });

    // Clean up failed clients
    failedClients.forEach(client => {
      this.cleanup(client);
    });

    await Promise.all(sendPromises);
  }

  async handlePublicChat(
    client: WebSocket,
    message: z.infer<typeof publicChatMessageInputSchema>
  ): Promise<void> {
    //TODO implement signature auth here, sending a message requires the user to be logged in.
    console.log('Handling public chat message', message);

    try {
      const { signature, sender, content } = message;
      const { roundId, timestamp } = message.content;
      const { error: signatureError } = verifySignedMessage(
        content,
        signature,
        sender,
        timestamp,
        SIGNATURE_WINDOW_MS
      );
      if (signatureError) {
        console.log('Public chat message failed signature verification', signatureError);
        await this.sendSystemMessage(client, signatureError, true, message);
        return;
      }

      const { round, valid, reason } = await roundPreflight(roundId);
      if (!valid) {
        console.log('Public chat message failed round preflight', reason);
        await this.sendSystemMessage(client, reason, true, message);
        return;
      }

      await this.broadcastToPublicChat({
        roomId: round.room_id,
        record: {
          round_id: roundId,
          user_id: message.content.userId,
          message: message,
        },
        excludeConnection: client,
      });

      console.log(
        `Public chat message from user ${message.sender} broadcasted to room #${round.room_id}`,
        message
      );
    } catch (error) {
      console.error(`Failed to handle public chat message:`, error);
      await this.sendSystemMessage(client, 'Failed to handle public chat message', true, message);
    }
  }

  // handles an on demand request to get the number of participants in a room
  async handleParticipants(
    client: WebSocket,
    message: z.infer<typeof participantsInputMessageSchema>
  ): Promise<void> {
    try {
      const roomId = message.content.roomId;
      if (!roomId) return;

      const connections = this.rooms.get(roomId);
      const count = connections?.size || 0;

      const response: z.infer<typeof participantsOutputMessageSchema> = {
        messageType: WsMessageTypes.PARTICIPANTS,
        content: {
          timestamp: Date.now(),
          roomId,
          count,
        },
      };
      client.send(JSON.stringify(response));
    } catch (error) {
      console.error(`Failed to handle participants message:`, error);
      await this.sendSystemMessage(client, 'Failed to handle participants message', true, message);
    }
  }

  // Update subscribe room handler
  async handleSubscribeRoom(
    client: WebSocket,
    message: z.infer<typeof subscribeRoomInputMessageSchema>
  ): Promise<void> {
    try {
      const roomId = message.content.roomId;
      
      // Check room exists first to fail fast
      const { error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError) {
        await this.sendSystemMessage(client, 'Room does not exist', true);
        return;
      }
      
      // Initialize room if needed
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      
      const room = this.rooms.get(roomId)!;
      
      // Add client to room with metadata
      room.add(client);
      this.clientInfo.set(client, { 
        roomId,
        lastActivity: Date.now()
      });

      // Send immediate confirmation
      await this.sendSystemMessage(
        client, 
        'Subscribed to room',
        false
      );

      // Setup heartbeat after confirmation
      const heartbeatInterval = this.setupHeartbeat(client);
      this.clientHeartbeats.set(client, heartbeatInterval);

      // Update participant count and broadcast
      await this.updateParticipantCount(roomId, room.size);
      await this.broadcastParticipantsToRoom({
        roomId,
        count: room.size
      });

      console.log(`Client subscribed to room ${roomId}. Participants: ${room.size}`);
    } catch (error) {
      console.error('Error in handleSubscribeRoom:', error);
      await this.sendSystemMessage(client, 'Failed to subscribe to room', true);
    }
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
      //Oh well, sync participant counts will fix it next time
    }
    this.broadcastParticipantsToRoom({ roomId: roomId, count: room.size });
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
    
    // Add proper client tracking
    const info = this.clientInfo.get(client);
    if (!info) {
      console.warn('Heartbeat received from untracked client');
      return;
    }
    
    // Update last activity timestamp
    info.lastActivity = Date.now();
    this.clientHeartbeats.set(client, setTimeout(() => {
      this.cleanup(client);
    }, this.HEARTBEAT_TIMEOUT));

    console.log(`Heartbeat processed for client in room ${info.roomId}`);
  }

  // TODO This is a debug route, remove before prod
  // Create a new GM message
  async handleGmMessage(
    client: WebSocket,
    message: z.infer<typeof gmMessageInputSchema>
  ): Promise<void> {
    //Process GM message takes care of validation + broadcast including a variant of signature verification
    const { error } = await processGmMessage(message);
    if (error) {
      console.error('Error processing GM message:', error);
      await this.sendSystemMessage(client, error, true, message);
    }
    await this.sendSystemMessage(client, 'GM Message processed and stored', false, message);
  }

  setupHeartbeat(client: WebSocket): NodeJS.Timeout {
    // Clear any existing heartbeat
    const existingHeartbeat = this.clientHeartbeats.get(client);
    if (existingHeartbeat) {
      clearInterval(existingHeartbeat);
    }

    // Set new heartbeat 
    return setInterval(() => {
      const info = this.clientInfo.get(client);
      if (!info || Date.now() - info.lastActivity > this.HEARTBEAT_TIMEOUT) {
        client.close(1000, 'Heartbeat missed');
        this.cleanup(client);
        return;
      }

      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          messageType: WsMessageTypes.HEARTBEAT,
          content: {}
        }));
      }
    }, this.HEARTBEAT_TIMEOUT * 2);
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

  // Add debug method to check room state
  public getRoomState(roomId: number): {
    connections: number;
    clients: { readyState: number }[];
  } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { connections: 0, clients: [] };
    }

    return {
      connections: room.size,
      clients: Array.from(room).map(ws => ({
        readyState: ws.readyState
      }))
    };
  }

  private async retryOperation(operation: () => Promise<void>): Promise<void> {
    let retries = this.MAX_RETRIES;
    while (retries > 0) {
      try {
        await operation();
        return;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async updateParticipantCount(roomId: number, count: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ participants: count })
        .eq('id', roomId);

      if (error) {
        console.error('Failed to update participant count:', error);
      }
    } catch (error) {
      console.error('Error updating participant count:', error);
    }
  }
}

export const wsOps = new WSOperations();
