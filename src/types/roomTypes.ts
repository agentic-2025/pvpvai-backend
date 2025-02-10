// src/rooms/types/roomTypes.ts
import { Database } from './database.types';



export interface RoomResponse {
  success: boolean;
  roomId?: number;
  error?: string;
}

export type RoomAgentAddRequest = {
  agent_id: number;
};

export type RoomAgentBulkAddRequest = {
  agent_ids: number[];
};

// Message related types
export interface MessageRequest {
  agent_id: number;
  timestamp: number;
  signature: string;
  content: any;
}

export interface AgentResponse {
  response: string;
  roomId: number;
  roundId: number;
}

// Service response types
export interface RoomOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Database types aliases for better readability
export type DBRoomAgent = Database['public']['Tables']['room_agents']['Row'];

export enum BetType {
  Buy = 0,
  Hold = 1,
  Sell = 2,
}

export enum RoundState {
  None = 0,
  Active = 1,
  Processing = 2,
  Closed = 3,
}
