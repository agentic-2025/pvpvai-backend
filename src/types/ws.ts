// src/types/ws.ts

import { PostgrestResponse } from '@supabase/supabase-js';

export type WSMessageInputType =
  | 'subscribe_room'
  | 'unsubscribe_room'
  | 'public_chat'
  | 'heartbeat'
  | 'system_notification'
  | 'ai_chat'
  | 'pvp_action'
  | 'gm_action';

export type WSMessageOutputType =
  | 'system_notification'
  | 'public_chat'
  | 'heartbeat'
  | 'ai_chat'
  | 'gm_action'
  | 'pvp_action';

export interface WSMessageInput {
  type: WSMessageInputType;
  timestamp?: number;
  signature?: string;
  author?: number;
  chainId?: number;
  content: {
    roomId?: number;
    roundId?: number;
    text?: string;
    data?: any;
    actionType?: string;
    targets?: string[];
  };
}

export interface WSMessageOutput {
  type: WSMessageOutputType;
  timestamp: number;
  signature: string;
  content: PublicChatContent | AIChatContent | GMMessageContent | PVPMessageContent | SystemNotificationContent | HeartbeatContent;
  error?: string;
}

export interface PublicChatContent {
  message_id: number;
  author: number;
  roomId: number;
  roundId: number;
  text: string;
  timestamp: number;
}

export interface SystemNotificationContent {
  text: string;
  error: boolean;
  originalMessage?: any;
  roomId?: number;
  roundId?: number;
}

export interface AIChatContent {
  message_id?: number;
  actor?: string;
  author?: number;
  roomId: number;
  roundId: number;
  text: string;
  timestamp: number;
  sent?: number;
  content?: {
    text: string;
  };
  originalContent?: {
    text: string;
  };
  altered?: boolean;
}

export interface PVPMessageContent {
  message_id?: number;
  txHash?: string;
  roomId: number;
  roundId?: number;
  instigator?: string; // should be string
  actionType: string;
  targets: string[];
  additionalData?: Record<string, any>;
}

export interface GMMessageContent {
  message_id?: number;
  text: string;
  gm_id: string;
  content?: {
    text: string;
  };
  targets: string[];
  roomId: number;
  timestamp?: number;
}

export interface HeartbeatContent {
  timestamp?: number;
}

export interface DbResult<T> {
  data: T[];
  error: Error | null;
}

export interface SingleDbResult<T> {
  data: T;
  error: Error | null;
}

export type DbResponse<T> = PostgrestResponse<T>;