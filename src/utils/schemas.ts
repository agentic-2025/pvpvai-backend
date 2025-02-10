import { z } from 'zod';
import { PvpActionCategories, PvpActions } from '../types/pvp';
import { WsMessageTypes } from '../types/ws';

// First, let's rename the base schema
const authenticatedMessageSchema = z.object({
  messageType: z.string(), // We'll override this with literals in extending schemas
  signature: z.string(),
  sender: z.string(),
});

/*
  SUBSCRIBE ROOM MESSAGES SCHEMA:
  Sent by:
    - WS: Users on room load over WS
  Received by: 
    - Single user: subscribeRoomOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Gives the user the number of participants in the room
*/
export const subscribeRoomInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.SUBSCRIBE_ROOM),
  content: z.object({
    roomId: z.number(),
  }),
});

export const subscribeRoomOutputMessageSchema = subscribeRoomInputMessageSchema; //Passthrough

/*
  HEARTBEAT MESSAGES SCHEMA:
  Sent by:
    - WS: Users send this in response to a heartbeat message from the server
  Received by: 
    - Single user: heartbeatOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Keeps the user's connection alive
*/
export const heartbeatInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.HEARTBEAT),
  content: z.object({}),
});

export const heartbeatOutputMessageSchema = heartbeatInputMessageSchema; //Passthrough

/* 
  OBSERVATION MESSAGES SCHEMA:
  Sent by: Oracle agents
  Received by: 
    - Agents: observationMessageAgentOutputSchema
    - Users (AI Chat): observationMessageAiChatOutputSchema
  Supported by:
    - REST: POST /messages/observations
    - (TODO Not currently supported by WS)

  Purpose: Provide data from external sources to agents to help inform their decisions
*/
export enum ObservationType {
  WALLET_BALANCES = 'wallet-balances',
  PRICE_DATA = 'price-data',
  GAME_EVENT = 'game-event',
}

// Wallet Balance Schemas
export const observationWalletBalanceDataSchema = z.object({
  walletBalances: z.record(
    z.string(),
    z.object({
      nativeBalance: z.bigint(),
      tokenBalances: z.record(z.string(), z.bigint()),
    })
  ),
});

// Price Data Schemas
export const observationPriceDataSchema = z.object({
  nativePrice: z.number(),
  tokenPrices: z.record(
    z.string(),
    z.object({
      source: z.string(),
      tokenPriceUsd: z.number(),
    })
  ),
});

// Sample data validation schemas
export const sampleObservationsSchema = z.object({
  [ObservationType.WALLET_BALANCES]: z.array(
    z.object({
      address: z.string(),
      balances: z.object({
        ETH: z.string(),
        USDC: z.string(),
        WETH: z.string(),
      }),
    })
  ),
  [ObservationType.PRICE_DATA]: z.array(
    z.object({
      pair: z.string(),
      price: z.string(),
      timestamp: z.number(),
    })
  ),
  [ObservationType.GAME_EVENT]: z.array(
    z.object({
      type: z.string(),
      details: z.string(),
    })
  ),
});

// Update the existing observation message schema to use these
export const observationMessageContentSchema = z.object({
  timestamp: z.number(),
  roomId: z.number(),
  roundId: z.number(),
  agentId: z.number(),
  observationType: z.nativeEnum(ObservationType),
  data: z.any(),
  // data: z.union([
  //   observationWalletBalanceDataSchema,
  //   observationPriceDataSchema,
  //   z.object({
  //     type: z.string(),
  //     details: z.string(),
  //   }),
  // ]),
});

export const observationMessageInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal('observation'),
  content: observationMessageContentSchema,
});

// Type exports
export type ObservationWalletBalanceData = z.infer<typeof observationWalletBalanceDataSchema>;
export type ObservationPriceData = z.infer<typeof observationPriceDataSchema>;
export type ObservationMessageContent = z.infer<typeof observationMessageContentSchema>;
export type ObservationMessage = z.infer<typeof observationMessageInputSchema>;

// Only difference between input and output is that the output message will be signed by GM
export const observationMessageAgentOutputSchema = observationMessageInputSchema; // Message sent to agents
export const observationMessageAiChatOutputSchema = observationMessageInputSchema; // Message sent to player facing AI Chat

/*
  PUBLIC CHAT MESSAGES SCHEMA:
  Sent by: 
    - Users
  Received by: 
    - Users: publicChatMessageOutputSchema
  Supported by:
    - WS
  Purpose: Allow users to send messages to all participants in a room, rendered in Public Chat control
*/
export const publicChatMessageInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal('public_chat'),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    text: z.string(),
  }),
});
export const publicChatMessageOutputSchema = publicChatMessageInputSchema; //Passthrough

/* 
--- AGENT MESSAGES SCHEMA ---
  Sent by: 
    - Agents
  Supported by:
    - REST (POST /messages/agentMessage)
  Received by: 
    - Agents: agentMessageAgentOutputSchema
    - Users (AI Chat): agentMessageAiChatOutputSchema
  Note: PvP rules applied on message sent to agents, additional details sent to users in AI Chat
  Purpose: Messages from agents to the room and other agents.
*/
export const agentMessageInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    agentId: z.number(),
    text: z.string(),
    context: z
      .array(
        z.object({
          id: z.number(),
          message: z.any(),
          message_type: z.string(),
          created_at: z.string(),
          agent_id: z.number(),
          original_author: z.number(),
          pvp_status_effects: z.record(z.string(), z.any()),
        })
      )
      .optional(),
  }),
});

// Message sent to agents, only difference between input and output message is that the output message's signature will be from the GM
export const agentMessageAgentOutputSchema = agentMessageInputSchema;
// Message sent to AI Chat (players) includes PvP details
export const agentMessageAiChatOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    senderId: z.number(),
    originalMessage: agentMessageInputSchema,
    originalTargets: z.array(z.number()),
    postPvpMessages: z.record(z.string(), agentMessageAgentOutputSchema),
    pvpStatusEffects: z.record(z.string(), z.array(z.any())), //TODO replace with actual PvP status effect schema
  }),
});

/*
  SYSTEM NOTIFICATION SCHEMA:
  Sent by: 
    - Nobody
  Received by: 
    - Single User: systemNotificationOutputSchema
    - Single Agent: systemNotificationOutputSchema
  Supported by:
    - WS exclusive
  Purpose: Informs a user or agent of a failed action when they invoked the action over WS
  Note: As this cannot be received no input schema is needed.
*/
export const systemNotificationOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.SYSTEM_NOTIFICATION),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number().optional(),
    roundId: z.number().optional(),
    text: z.string(),
    error: z.boolean(),
    originalMessage: z.any().optional(), // The original message that caused the notification to be sent
  }),
});

/*
  PARTICIPANTS MESSAGES SCHEMA:
  Sent by: 
    - WS: Users on room load over WS
  Received by: 
    - Single user: participantsOutputMessageSchema
    - Users in room: participantsOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Gives the user the number of participants in the room
*/
export const participantsInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.PARTICIPANTS),
  content: z.object({
    roomId: z.number().int().positive(),
  }),
});

export const participantsOutputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.PARTICIPANTS),
  content: z.object({
    timestamp: z.number().int().positive(),
    roomId: z.number().int().positive(),
    count: z.number().int().nonnegative(),
  }),
});

/*
  GM MESSAGES SCHEMA:
  Sent by:
    - GM over ???
  Received by:
    - One or more agents: gmMessageAgentOutputSchema
    - All users in the room: gmMessageAiChatOutputSchema
  Purpose: Sent when the GM wants to send a message to all agents or all users in the room
*/
export const gmMessageInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.GM_MESSAGE),
  content: z.object({
    gmId: z.number(),
    timestamp: z.number(),
    targets: z.array(z.number()),
    roomId: z.number(),
    roundId: z.number(),
    message: z.string(),
    deadline: z.number().optional(),
    additionalData: z.record(z.string(), z.any()).optional(),
    ignoreErrors: z.boolean().optional().default(false),
  }),
});
export const gmMessageAgentOutputSchema = gmMessageInputSchema; // GM messages are passthrough to agents
export const gmMessageAiChatOutputSchema = gmMessageInputSchema; // GM messages are passthrough to AI Chat


// Response to every POST request to /messages
export const messagesRestResponseSchema = z.object({
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type AllOutputSchemaTypes =
  | z.infer<typeof publicChatMessageOutputSchema>
  | z.infer<typeof participantsOutputMessageSchema>
  | z.infer<typeof systemNotificationOutputSchema>
  | z.infer<typeof agentMessageAiChatOutputSchema>;

// All types of messages that the backend can receive
export type AllInputSchemaTypes =
  | z.infer<typeof observationMessageInputSchema>
  | z.infer<typeof agentMessageInputSchema>
  | z.infer<typeof publicChatMessageInputSchema>
  | z.infer<typeof participantsInputMessageSchema>
  | z.infer<typeof gmMessageInputSchema>
  | z.infer<typeof heartbeatInputMessageSchema>
  | z.infer<typeof subscribeRoomInputMessageSchema>;

// All types of messages that will be sent to/received by agents
export type AllAgentChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAgentOutputSchema>
  | z.infer<typeof agentMessageAgentOutputSchema>
  | z.infer<typeof gmMessageAgentOutputSchema>;
//TODO GM message type will go here;

// All types of messages that will be sent to/received by users to render in AI Chat
export type AllAiChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAiChatOutputSchema>
  | z.infer<typeof agentMessageAiChatOutputSchema>
  | z.infer<typeof gmMessageAiChatOutputSchema>
  | z.infer<typeof pvpActionEnactedAiChatOutputSchema>;
// Common schemas
export const validEthereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const signatureSchema = z.string();
export const timestampSchema = z.number().int().positive();

// Room related schemas
export const roomConfigSchema = z.object({
  round_duration: z.number().int().positive(),
  pvp_config: z.object({
    enabled: z.boolean(),
    enabled_rules: z.array(z.string()),
  }),
});

export const agentConfigSchema = z.object({
  // wallet: walletAddressSchema,
  webhook: z.string().url(),
});

export const roomSetupContentSchema = z.object({
  timestamp: z.number(),
  name: z.string().min(1),
  room_type: z.string(),
  color: z
    .string()
    .optional()
    .default('#' + Math.floor(Math.random() * 16777215).toString(16)),
  image_url: z.string().url().optional().default('https://avatar.iran.liara.run/public'),
  token: validEthereumAddressSchema,
  token_webhook: z.string().url(),
  agents: z.array(z.number()),
  // agents: z.record(z.string(), agentConfigSchema),
  gm: z.number(),
  chain_id: z.number(),
  chain_family: z.string(),
  room_config: roomConfigSchema,
  transaction_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
});

export const roomSetupSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.CREATE_ROOM),
  content: roomSetupContentSchema,
});

export const agentAddSchema = z.object({
  agent_id: z.number().int().positive(),
  wallet_address: z.string(),
  wallet_json: z.any(),
});

export const agentBulkAddSchema = z.object({
  agents: z.array(
    z.object({
      id: z.number().int().positive(),
      walletAddress: z.string(),
    })
  ),
});

// Round related schemas
// export const roundMessageSchema = z.object({
//   agent_id: z.number().int().positive(),
//   timestamp: timestampSchema,
//   signature: signatureSchema,
//   content: z.object({
//     text: z.union([
//       z.string(),
//       z.object({
//         text: z.string(),
//       }),
//     ]),
//   }),
// });

// Add the agent message input schema
export const roundMessageInputSchema = authenticatedMessageSchema.extend({
  type: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    agentId: z.number().int().positive(),
    roundId: z.number().int().positive(),
    text: z.string(),
  }),
});

// Update the interface to use the schema type

export const roundOutcomeSchema = z.object({
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
  data: z.record(z.any()).optional(),
});

export const endRoundSchema = z.object({
  outcome: roundOutcomeSchema.optional(),
});

export const kickParticipantSchema = z.object({
  agentId: z.number().int().positive(),
});

// Export types generated from schemas
export type RoomAgentAdd = z.infer<typeof agentAddSchema>;
export type RoomAgentBulkAdd = z.infer<typeof agentBulkAddSchema>;
export type RoundMessage = z.infer<typeof roundMessageInputSchema>;
export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;
export type KickParticipant = z.infer<typeof kickParticipantSchema>;

export const gmInstructDecisionInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.GM_INSTRUCT_DECISION),
  content: z.object({
    roomId: z.number(),
    roundId: z.number(),
  }),
});

enum DecisionType {
  BUY = 1,
  SELL = 2,
  HOLD = 3,
}

export const agentDecisionAiChatOutputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.AGENT_DECISION),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    agentId: z.number(),
    decision: z.nativeEnum(DecisionType),
  }),
});
