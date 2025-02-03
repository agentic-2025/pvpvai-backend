// src/rooms/types/roomTypes.ts
import { Database } from './database.types';

export interface RoomSetupData {
  name: string;
  room_type: string;
  color?: string;
  image_url?: string;
  token: string;
  token_webhook: string;
  agents: Record<string, { wallet: string; webhook: string }>;
  gm: string;
  chain_id: string;
  chain_family: string;
  room_config: any;
  transaction_hash: string;
}

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
export type DBRoom = Database['public']['Tables']['rooms']['Row'];
export type DBRoomInsert = Database['public']['Tables']['rooms']['Insert'];
export type DBRoomAgent = Database['public']['Tables']['room_agents']['Row'];
