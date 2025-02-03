import { WebSocket } from 'ws';
import { WsMessageOutputTypes } from '../types/ws';
import { systemNotificationOutputMessageSchema } from '../utils/schemas';
// Types for room management
export type RoomMap = Map<number, Set<WebSocket>>;
export type ClientInfo = Map<WebSocket, { roomId: number }>;
export type HeartbeatMap = Map<WebSocket, NodeJS.Timeout>;

