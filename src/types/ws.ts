export type WSMessageInputType =
  | 'subscribe_room'
  | 'unsubscribe_room'
  | 'public_chat'
  | 'heartbeat'
  | 'system_notification'
  | 'ai_chat'
  | 'pvp_action';

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
  };
}

export interface WSMessageOutput {
  type: WSMessageOutputType;
  timestamp: number;
  signature: string;
  content: PublicChatContent | AIChatContent | GMMessageContent | PVPMessageContent | SystemNotificationContent;
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

export interface AiContextUpdate {
  source_type: "news" | "social media" | "onchain" | "other";
  data: JSON;
}

export interface AIChatContent {
  message_id: number;
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
  message_id: number;
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
  message_id: number;
  gm_id: string; //Address of the GM taking the action TODO change to addresslike
  content: {
    text: string;
  }; // The content of the GM message, typically describes the action being taken. Can support just text initially, eventually need to support full message type
  targets: string[]; // If the GM is taking action against a specific agent, like kicking them or forcing a decision, the targets will appear here.
  timestamp: number;
}

export interface HeartbeatContent {}
