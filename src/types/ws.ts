import { ObservationType } from '../rooms/routes/observationRoutes';
import { RoundMessage } from '../rooms/validators/schemas';
import { AllPvpActions, PvpActions, PvpStatusEffect } from './pvp';
export enum WsMessageInputTypes {
  // Sent by: Users in room
  // Purpose: Request to start receiving messages for a room
  SUBSCRIBE_ROOM_INPUT = 'subscribe_room',
  // Sent by: Users in room
  // Purpose: Send a message to the public chat
  PUBLIC_CHAT_INPUT = 'public_chat',
  // Sent by: Users
  // Purpose: Response to a health check from the WS Server
  HEARTBEAT_INPUT = 'heartbeat',
  // Sent by: Users
  // Purpose: Get the total number of participants in the room to display in the UI
  PARTICIPANTS_INPUT = 'participants',
  // Sent by: Agents in room
  // Purpose: Send a message to the other agents in the room
  AGENT_MESSAGE_INPUT = 'agent_message',
}

export enum WsMessageOutputTypes {
  // Response to: PUBLIC_CHAT_INPUT
  // Recipients: Users
  // Purpose: Send a message received from PUBLIC_CHAT_INPUT to all users in the room
  PUBLIC_CHAT_OUTPUT = 'public_chat',

  // Response to: None
  // Recipients: Single user
  // Purpose: Health check on a user in the room
  HEARTBEAT_OUTPUT = 'heartbeat',

  // Response to: "participants" WS message input type, also sent when connections are added or removed in room
  // Recipients: Single user
  // Purpose: Send the number of participants in the room to a single user, used solely to keep the UI updated
  PARTICIPANTS_OUTPUT = 'participants', // payload containing the number of participants in the room

  // Response to: ???
  // Recipients: Single agent, Users
  // Purpose: Send a high priority message to one or more agents to force the round to progress.
  // Dual purpose: Message is relayed to AI Chat to inform subscribed users
  GM_ACTION_OUTPUT = 'gm_action',

  // Response to: Any input message
  // Recipients: Single user
  // Purpose: Send a message to an individual user to inform them of something, typically used to notify of a failed action they took or a system error
  SYSTEM_NOTIFICATION_OUTPUT = 'system_notification',

  // Response to: POST request to /observations
  // Recipients: Agents, Users
  // Purpose: Send an observation to all agents in the room
  // Dual purpose: Message is relayed to AI Chat to inform subscribed users of an observation presented to the agents
  OBSERVATION_OUTPUT = 'observation', // Sent to all users in room and all agents.Render in AI Chat. Message relating to an observation from external data

  // Response to: AGENT_MESSAGE_INPUT
  // Recipients: Agents
  // Purpose: Send a message received from AGENT_MESSAGE_INPUT to all other agents in the round. Intentionally contains no details about PvP actions.
  AGENT_MESSAGE_OUTPUT = 'agent_message',

  // Response to: AGENT_MESSAGE_INPUT
  // Recipients: Users
  // Purpose: Send a message received from AGENT_MESSAGE_INPUT to all users in the room, message will contain details about what PvP actions were taken on the message
  AI_CHAT_AGENT_MESSAGE_OUTPUT = 'ai_chat_agent_message',

  // Response to: POST request to /rounds/:roundId/pvp
  // Recipients: Users
  // Purpose: Informs users that a PvP action has been applied to an agent, be it a direct action or a status effect
  AI_CHAT_PVP_ACTION = 'ai_chat_pvp_action',

  // Response to: None (background process monitors when a PvP status is removed and notifies users)
  // Recipients: Users
  // Purpose: Informs users that a PvP status has been removed from an agent
  AI_CHAT_PVP_STATUS_REMOVED_OUTPUT = 'ai_chat_pvp_status_removed',
}

export interface AuthenticatedMessage {
  timestamp: number; //Timestamp used to prevent replay attacks, optional for right now until we implement signature auth across the board.
  signature: string; //Signature of the content and timestamp. Optional for right now until we implement signature auth across the board.
  sender: string; //Address of the sender, must match signature. Optional for right now until we implement signature auth across the board.
}

export interface SubscribeRoomInputMessage {
  type: WsMessageInputTypes.SUBSCRIBE_ROOM_INPUT;
  content: {
    roomId: number;
  };
}

export interface ParticipantsInputMessage {
  type: WsMessageInputTypes.PARTICIPANTS_INPUT;
  content: {
    roomId: number;
  };
}

export interface HeartbeatInputMessage {
  type: WsMessageInputTypes.HEARTBEAT_INPUT;
  content: {};
}

export interface PublicChatInputMessage extends AuthenticatedMessage {
  type: WsMessageInputTypes.PUBLIC_CHAT_INPUT;
  content: {
    roundId: number;
    userId: number;
    text: string;
  };
}

export type AgentMessageInputMessage = RoundMessage;

export type PublicChatOutputMessage = PublicChatInputMessage; //Public chat is a straight pass through of the input message

export type HeartbeatOutputMessage = HeartbeatInputMessage; //Backend + user both use the same heartbeat message

export interface GMOutputMessage extends AuthenticatedMessage {
  type: WsMessageOutputTypes.GM_ACTION_OUTPUT;
  content: {
    roomId?: number;
    roundId?: number;
    content: {
      text: string; // The content of the GM message, typically describes the action being taken. Can support just text initially, eventually need to support full message type
    };
  };
}

export interface ParticipantsOutputMessage {
  type: WsMessageOutputTypes.PARTICIPANTS_OUTPUT;
  timestamp: number;
  content: {
    roomId: number;
    count: number;
  };
}

export interface SystemNotificationOutputMessage {
  type: WsMessageOutputTypes.SYSTEM_NOTIFICATION_OUTPUT;
  timestamp: number;
  content: {
    roomId?: number;
    roundId?: number;
    text: string;
    error: boolean;
    originalMessage?: any; // The original message that caused the notification to be sent
  };
}

export interface ObservationWalletBalanceData {
  walletBalances: {
    [walletAddress: string]: {
      nativeBalance: BigInt;
      tokenBalances: { [tokenAddress: string]: BigInt };
    };
  };
}

export interface ObservationPriceData {
  nativePrice: number;
  tokenPrices: {
    [tokenAddress: string]: {
      source: string;
      tokenPriceUsd: number;
    };
  };
}

// Message is signed by GM. Agents must reject messages that are not signed by GM
export interface AgentMessageOutputMessage extends AuthenticatedMessage {
  type: WsMessageOutputTypes.AGENT_MESSAGE_OUTPUT;
  content: {
    messageId: number;
    roundId: number;
    agentId: number;
    agentRoomAddress: string;
    text: string;
  };
}

export interface ObservationOutputMessage {
  type: WsMessageOutputTypes.OBSERVATION_OUTPUT;
  timestamp: number;
  content: {
    observationType: ObservationType;
    roomId: number;
    roundId: number;
    data: ObservationWalletBalanceData | ObservationPriceData;
  };
}

// This message is sent to players in the room, it exposes the PvP actions that were taken on the message
export interface AiChatAgentMessageOutputMessage{
  type: WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT;
  content: {
    roomId: number;
    roundId: number;
    senderId: number;
    originalMessages: { agentId: number; message: any }[];
    postPvpMessages: { agentId: number; message: any }[];
    //TODO Need to implement JSON schema to type pvpStatusEffects: https://supabase.com/docs/guides/database/json#validating-json-data
    pvpStatusEffects: { [agentId: string]: [PvpStatusEffect] };
    // pvpStatusEffects: { [agentId: string]: [PvpStatusEffect] };
  };
}

export interface AiChatPvpStatusAppliedOutputMessage {
  type: WsMessageOutputTypes.AI_CHAT_PVP_ACTION;
  timestamp: number;
  content: {
    roundId: number;
    agentId: number;
    instigator: string; // Address of the player who initiated the action
    txHash?: string;
    pvpAction: AllPvpActions;
  };
}

export interface AiChatPvpStatusRemovedOutputMessage {
  type: WsMessageOutputTypes.AI_CHAT_PVP_STATUS_REMOVED_OUTPUT;
  timestamp: number;
  content: {
    roundId: number;
    agentId: number;
    instigator: string; // Address of the player who initiated the action
    pvpAction: PvpActions;
  };
}

export type WsRoomLevelOutputTypes =
  | ParticipantsOutputMessage
  | PublicChatOutputMessage
  | GMOutputMessage
  | SystemNotificationOutputMessage
  | AiChatAgentMessageOutputMessage
  | AiChatPvpStatusAppliedOutputMessage
  | AiChatPvpStatusRemovedOutputMessage
  | ObservationOutputMessage;
