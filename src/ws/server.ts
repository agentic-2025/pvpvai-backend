import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { supabase } from '../config';
import {
  participantsOutputMessageSchema,
  systemNotificationOutputSchema,
} from '../schemas/wsServer';
import { WsMessageTypes } from '../types/ws';
import { AllInputSchemaTypes, heartbeatOutputMessageSchema } from '../utils/schemas';
import { wsOps } from './operations';

export type RoomMap = Map<number, Set<WebSocket>>;
export type ClientInfo = Map<WebSocket, { roomId: number }>;
export type HeartbeatMap = Map<WebSocket, NodeJS.Timeout>;

export class WSServer {
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

  public async sendMessageToRoom(params: {
    roomId: number;
    message: any;
    excludeConnection?: WebSocket;
  }): Promise<void> {
    const room = this.rooms.get(params.roomId);
    if (!room) {
      console.log(
        `Room ${params.roomId} has no connections, will not broadcast message: `,
        params.message
      );
      return;
    }

    console.log('Sending message to room', params.roomId, params.message, params.excludeConnection);

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
    await this.broadcastParticipantsToRoom({ roomId: roomId, count: room.size });
  }

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

  cleanup(client: WebSocket): void {
    const info = this.clientInfo.get(client);
    if (info) {
      this.removeClientFromRoom(client, info.roomId);
    }

    const timeout = this.clientHeartbeats.get(client);
    if (timeout) clearTimeout(timeout);
    this.clientHeartbeats.delete(client);
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

  // Getters for operations.ts to use
  getRooms(): RoomMap {
    return this.rooms;
  }

  getClientInfo(): ClientInfo {
    return this.clientInfo;
  }
}

export const wsServer = new WSServer();

export async function setupWebSocketServer(server: FastifyInstance) {
  server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const client = connection;

      // Set up heartbeat check for this client
      const heartbeatInterval = wsServer.setupHeartbeat(client);

      client.on('message', async (message: Buffer) => {
        try {
          const data: AllInputSchemaTypes = JSON.parse(message.toString());
          console.log(`Received ${data.messageType} message...`);

          switch (data.messageType) {
            case WsMessageTypes.SUBSCRIBE_ROOM:
              console.log('Handling subscribe room:', JSON.parse(message.toString()));
              wsOps.handleSubscribeRoom(client, data);
              break;

            case WsMessageTypes.PARTICIPANTS:
              wsOps.handleParticipants(client, data);
              break;

            case WsMessageTypes.PUBLIC_CHAT:
              await wsOps.handlePublicChat(client, data);
              break;

            case WsMessageTypes.HEARTBEAT:
              wsServer.handleHeartbeat(client);
              break;

            case WsMessageTypes.GM_MESSAGE:
              console.log('Handling GM message:', data);
              await wsOps.handleGmMessage(client, data);
              break;

            default:
              wsServer.sendSystemMessage(
                client,
                'Invalid message type ' +
                  data.messageType +
                  ', please pass a supported message type:' +
                  Object.values(WsMessageTypes).join(', '),
                true,
                data
              );
          }
        } catch (err) {
          wsServer.sendSystemMessage(client, 'Hit error handling message: ' + err, true, message);
        }
      });

      // Clean up on client disconnect
      client.on('close', () => {
        wsServer.cleanup(client);
        clearInterval(heartbeatInterval);
      });
    });
  });
}
