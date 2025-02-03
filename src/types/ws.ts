import { ObservationType } from '../rooms/routes/observationRoutes';

export enum WsMessageType {
  SUBSCRIBE_ROOM = 'subscribe_room',
  UNSUBSCRIBE_ROOM = 'unsubscribe_room',
  PUBLIC_CHAT = 'public_chat',
  HEARTBEAT = 'heartbeat',
  GM_ACTION = 'gm_action',
  SYSTEM_NOTIFICATION = 'system_notification',
  AI_CHAT = 'ai_chat',
  PVP_ACTION = 'pvp_action',
  OBSERVATION = 'observation',
}

export interface WSMessageInput {
  type: WsMessageType;
  timestamp?: number;
  signature?: string;
  author?: number;
  chainId?: number;
  content:
    | PublicChatContent
    | AIChatContent
    | GMMessageContent
    | PVPMessageContent
    | SystemNotificationContent
}

export interface WSMessageOutput {
  type: WsMessageType;
  timestamp: number;
  signature: string;
  content:
    | PublicChatContent
    | AIChatContent
    | GMMessageContent
    | PVPMessageContent
    | SystemNotificationContent;
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

export interface WalletBalanceData {
  nativeBalance: BigInt;
  tokenBalance: BigInt;
  nativeValue: number;
  usdValue: number;
  percentChangeNative: number;
  percentChangeUsd: number;
}
export interface PriceData {
  source: string;
  tokenPriceNative: number;
  tokenPriceUsd: number;
  nativePriceUsd: number;
}

export interface ExternalDataContent {
  account: string;
  timestamp: number;
  signature: string;
  message_type: ObservationType;
  content: any;
}

export interface SystemNotificationContent {
  text: string;
  error: boolean;
  originalMessage?: any;
  roomId?: number;
  roundId?: number;
}

export interface AiContextUpdate {
  source_type: 'news' | 'social media' | 'onchain' | 'other';
  data: JSON;
}

export interface AIChatContent {
  messageId: number;
  roomId: number;
  roundId: number;
  actor: string; // The blockchain address of the AI agent who sent the message
  sent: number; // UTC timestamp in milliseconds when message was sent to backend
  originalContent?: {
    // Original message content before any modifications. Will be empty and should be ignored if message was not altered.
    text: string;
  };

  content: {
    // Current message content. If the message was altered, this will be the altered version. Supports text initially, will be expanded to support full Eliza Message type later
    text: string;
  };
  timestamp: number;
  altered: boolean; // Indicates if message was modified by PVP actions. When present, app can render a different UI for the message
}

export interface PVPMessageContent {
  messageId: number;
  txHash: string;
  roomId: number;
  roundId: number;
  instigator: string; // The address of the person who took the action
  //Silence = mute agent from sending messages, Deafen = block agent from receiving messages, Attack = Direct DM, Poison = Alter agent messages
  actionType: 'Silence' | 'Deafen' | 'Attack' | 'Poison';
  targets: string[]; // addresses of agents the action is being taken on
  additionalData: {
    // Free form object containing data, like find and replace data for Poison, text to inject for Attack
  };
}

export interface GMMessageContent {
  messageId: number;
  gmId: number; //Address of the GM taking the action TODO change to addresslike
  roomId: number;
  roundId: number;
  content: {
    text: string;
  }; // The content of the GM message, typically describes the action being taken. Can support just text initially, eventually need to support full message type
  // targets: string[]; // If the GM is taking action against a specific agent, like kicking them or forcing a decision, the targets will appear here.
  timestamp: number;
}

export interface HeartbeatContent {}
