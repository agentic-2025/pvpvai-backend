import { z } from 'zod';
import { WsMessageInputTypes } from '../../types/ws';

/* 
  OBSERVATION MESSAGES SCHEMA:
  Sent by: Oracle agents
  Supported by:
    - REST: POST /messages/observations
    - (TODO Not currently supported by WS)
  Received by: Agents
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
export const observationMessageAgentSchema = observationMessageInputSchema; // Message sent to agents
export const observationMessageAiChatSchema = observationMessageInputSchema; // Message sent to player facing AI Chat


/*
  PUBLIC CHAT MESSAGES SCHEMA:
  Sent by: Users
  Supported by:
    - WS
  Received by: Users
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



// REST Response to every POST request to /messages
export type RestMessagesPostResponse = {
  message?: string;
  data?: any;
  error?: string;
};

export type AllMessageInputSchemaTypes = z.infer<typeof observationMessageInputSchema>;

export type AllAgentChatMessageSchemaTypes = z.infer<typeof observationMessageAgentSchema>;
// Union of all AI
export type AllAiChatMessageSchemaTypes = z.infer<typeof observationMessageAiChatSchema>;

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
