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
    const { roomId, record, excludeConnection } = params;

    console.log(`Inserting into round_agent_messages (${record.message_type})`, record);

    // First insert the message into the database
    const { error } = await supabase.from('round_agent_messages').insert(record);
    if (error) {
      throw new Error('Failed to insert message into round_agent_messages: ' + error);
      // console.error('Failed to insert message into round_agent_messages:', error);

      //Oh well, we tried (for now)
    }
    await this.sendMessageToRoom({
      roomId,
      message: record.message,
      excludeConnection,
    });
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
    // Then broadcast to room participants
    const room = this.rooms.get(params.roomId);
    if (!room) {
      console.log(
        `Room ${params.roomId} has no connections, will not broadcast message: `,
        params.message
      );
      return;
    }

    const messageString = JSON.stringify(params.message);
    const sendPromises: Promise<void>[] = [];

    room.forEach((client) => {
      if (client !== params.excludeConnection && client.readyState === WebSocket.OPEN) {
        sendPromises.push(
          new Promise<void>((resolve, reject) => {
            client.send(messageString, (err: any) => {
              if (err) reject(err);
              else resolve();
            });
          }).catch((err) => {
            console.error(`Failed to send message to client in room ${params.roomId}:`, err);
          })
        );
      }
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
      if (!message.content?.roomId) {
        await this.sendSystemMessage(
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
        await this.sendSystemMessage(client, 'Room does not exist', true, message);
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

      await this.sendSystemMessage(client, 'Subscribed to room', false, message);
      await this.broadcastParticipantsToRoom({ roomId: roomId, count: room.size });
    } catch (error) {
      console.error(`Failed to handle subscribe room message:`, error);
      await this.sendSystemMessage(
        client,
        'Failed to handle subscribe room message',
        true,
        message
      );
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
    this.clientHeartbeats.delete(client);
    const info = this.clientInfo.get(client);
    if (info) {
      console.log(
        `Received heartbeat from client ${client.url || 'unknown'} in room ${info.roomId}`
      );
    }
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
    return setInterval(() => {
      if (this.clientHeartbeats.has(client)) {
        client.close(1000, 'Heartbeat missed');
        this.cleanup(client);
      }

      const heartbeatMessage: z.infer<typeof heartbeatOutputMessageSchema> = {
        messageType: WsMessageTypes.HEARTBEAT,
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

export const wsOps = new WSOperations();
