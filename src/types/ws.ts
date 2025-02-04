import { AllPvpActions, PvpActions } from './pvp';

export enum WsMessageTypes {
  // Sent by: Users in room
  // Purpose: Request to start receiving messages for a room
  SUBSCRIBE_ROOM = 'subscribe_room',
  // Sent by: Users in room
  // Purpose: Send a message to the public chat
  PUBLIC_CHAT = 'public_chat',
  // Sent by: Single user
  // Purpose: Response to a health check from the WS Server
  HEARTBEAT = 'heartbeat',
  // Sent by: Single user
  // Purpose: Get the total number of participants in the room to display in the UI
  PARTICIPANTS = 'participants',

  // BELOW IS NOT YET IMPLEMENTED
  // Sent by: Agents in room
  // Purpose: Send a message to the other agents in the room
  AGENT_MESSAGE = 'agent_message',

  // BELOW IS NOT YET IMPLEMENTED
  // Sent by: ???
  // Purpose: Send a GM message to agents, must be treated with the highest priority to ensure round progresses
  GM_MESSAGE = 'gm_message',

  // Response to: Any WS input message
  // Recipients: Single user
  // Purpose: Send a message to an individual user to inform them of something, typically used to notify of a failed action they took or a system error
  SYSTEM_NOTIFICATION = 'system_notification',

  // Response to: POST request to /rooms/:roomId/rounds/:roundId/observations
  // Recipients: Users
  // Purpose: Send an observation to all agents in the room
  // Dual purpose: Message is relayed to AI Chat to inform subscribed users of an observation presented to the agents
  OBSERVATION = 'observation',
  // Response to: AGENT_MESSAGE_INPUT, POST /rooms/:roomId/rounds/:roundId/aiChat
  // Recipients: Users
  // Purpose: Send a message received from AGENT_MESSAGE_INPUT to all users in the room, message will contain details about what PvP actions were taken on the message
  AI_CHAT_AGENT_MESSAGE = 'ai_chat_agent_message',

  // Response to: POST request to /rounds/:roundId/pvp
  // Recipients: Users
  // Purpose: Informs users that a PvP action has been applied to an agent, be it a direct action or a status effect
  AI_CHAT_PVP_ACTION_ENACTED = 'ai_chat_pvp_action_enacted',

  // Response to: None (background process monitors when a PvP status is removed and notifies users)
  // Recipients: Users
  // Purpose: Informs users that a PvP status has been removed from an agent
  AI_CHAT_PVP_STATUS_REMOVED = 'ai_chat_pvp_status_removed',
}

export interface AuthenticatedMessage {
  signature: string; //Signature of the content and timestamp. Optional for right now until we implement signature auth across the board.
  sender: string; //Address of the sender, must match signature. Optional for right now until we implement signature auth across the board.
}

export interface SubscribeRoomInputMessage {
  type: WsMessageTypes.SUBSCRIBE_ROOM;
  content: {
    roomId: number;
  };
}

export interface HeartbeatInputMessage {
  type: WsMessageTypes.HEARTBEAT;
  content: {};
}

export type HeartbeatOutputMessage = HeartbeatInputMessage; //Backend + user both use the same heartbeat message

export interface GMOutputMessage extends AuthenticatedMessage {
  type: WsMessageTypes.GM_MESSAGE;
  content: {
    timestamp: number;
    roomId?: number;
    roundId?: number;
    content: {
      text: string; // The content of the GM message, typically describes the action being taken. Can support just text initially, eventually need to support full message type
    };
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

export interface AiChatPvpStatusAppliedOutputMessage {
  type: WsMessageTypes.AI_CHAT_PVP_ACTION_ENACTED;
  content: {
    timestamp: number;
    roomId: number; //Room id could be useful for player facing message since user subscribed to room, not round
    roundId: number;
    agentId: number;
    instigator: string; // Address of the player who initiated the action
    txHash?: string;
    pvpAction: AllPvpActions;
  };
}

export interface AiChatPvpStatusRemovedOutputMessage {
  type: WsMessageTypes.AI_CHAT_PVP_STATUS_REMOVED;
  content: {
    timestamp: number;
    roomId: number; //Room id could be useful for player facing message since user subscribed to room, not round
    roundId: number;
    agentId: number;
    instigator: string; // Address of the player who initiated the action
    pvpAction: PvpActions;
  };
}

export type WsRoomLevelOutputTypes =
  | GMOutputMessage
  | AiChatPvpStatusAppliedOutputMessage
  | AiChatPvpStatusRemovedOutputMessage;
