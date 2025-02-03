import { z } from 'zod';
import { WsMessageInputTypes, WsMessageOutputTypes } from '../types/ws';

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

export const observationMessageInputSchema = z.object({
  messageType: z.literal('observation'),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    agentId: z.number().int().positive(), //The agent who sent the message
    timestamp: z.number(),
    roomId: z.number(), // Redundant with path, but kept here since this message is passthrough to AI Chat for frontend.
    roundId: z.number(),
    observationType: z.nativeEnum(ObservationType),
    data: z.any(),
  }),
});

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
export const publicChatMessageInputSchema = z.object({
  messageType: z.literal('public_chat'),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    roomId: z.number(),
    roundId: z.number(),
    userId: z.number(),
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
export const agentMessageInputSchema = z.object({
  messageType: z.literal('agent_message'),
  signature: z.string(), // GM receives message signed by agent
  sender: z.string(),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    agentId: z.number(),
    text: z.string(),
  }),
});

// Message sent to agents, only difference between input and output message is that the output message's signature will be from the GM
export const agentMessageAgentOutputSchema = agentMessageInputSchema;
// Message sent to AI Chat (players) includes PvP details
export const agentMessageAiChatOutputSchema = z.object({
  type: z.literal(WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    senderId: z.number(),
    originalMessages: z.array(
      z.object({
        agentId: z.number(),
        message: z.any(),
      })
    ),
    postPvpMessages: z.array(
      z.object({
        agentId: z.number(),
        message: z.any(),
      })
    ),
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
  type: z.literal('system_notification'),
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
  type: z.literal(WsMessageInputTypes.PARTICIPANTS_INPUT),
  content: z.object({
    roomId: z.number().int().positive(),
  }),
});

export const participantsOutputMessageSchema = z.object({
  type: z.literal(WsMessageOutputTypes.PARTICIPANTS_OUTPUT),
  content: z.object({
    timestamp: z.number().int().positive(),
    roomId: z.number().int().positive(),
    count: z.number().int().nonnegative(),
  }),
});

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
  ;

// All types of messages that will be sent to/received by agents
export type AllAgentChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAgentOutputSchema>
  | z.infer<typeof agentMessageAgentOutputSchema>;
//TODO GM message type will go here;

// All types of messages that will be sent to/received by users to render in AI Chat
export type AllAiChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAiChatOutputSchema>
  | z.infer<typeof agentMessageAiChatOutputSchema>;
//TODO PVP and GM message types will go here;

// Common schemas
export const walletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
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
  wallet: walletAddressSchema,
  webhook: z.string().url(),
});

export const roomSetupSchema = z.object({
  name: z.string().min(1),
  room_type: z.string(),
  color: z.string().optional(),
  image_url: z.string().url().optional(),
  token: walletAddressSchema,
  token_webhook: z.string().url(),
  agents: z.record(z.string(), agentConfigSchema),
  gm: walletAddressSchema,
  chain_id: z.string(),
  chain_family: z.string(),
  room_config: roomConfigSchema,
  transaction_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export const agentAddSchema = z.object({
  agent_id: z.number().int().positive(),
});

export const agentBulkAddSchema = z.object({
  agent_ids: z.array(z.number().int().positive()),
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

// Add this schema for authenticated messages
export const authenticatedMessageSchema = z.object({
  timestamp: z.number(),
  signature: z.string(),
  sender: z.string(),
});

// Add the agent message input schema
export const roundMessageInputSchema = authenticatedMessageSchema.extend({
  type: z.literal(WsMessageInputTypes.AGENT_MESSAGE_INPUT),
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
export type RoomSetup = z.infer<typeof roomSetupSchema>;
export type RoomAgentAdd = z.infer<typeof agentAddSchema>;
export type RoomAgentBulkAdd = z.infer<typeof agentBulkAddSchema>;
export type RoundMessage = z.infer<typeof roundMessageInputSchema>;
export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;
export type KickParticipant = z.infer<typeof kickParticipantSchema>;
