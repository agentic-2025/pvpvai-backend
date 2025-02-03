import { z } from 'zod';
import { WsMessageInputTypes } from '../../types/ws';

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