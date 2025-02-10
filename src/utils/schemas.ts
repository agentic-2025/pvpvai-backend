import { z } from 'zod';
import {
  agentMessageAgentOutputSchema,
  agentMessageAiChatOutputSchema,
  agentMessageInputSchema,
} from '../schemas/agentMessage';
import {
  heartbeatInputMessageSchema,
  participantsInputMessageSchema,
  participantsOutputMessageSchema,
  subscribeRoomInputMessageSchema,
  systemNotificationOutputSchema,
} from '../schemas/wsServer';
import { WsMessageTypes } from '../types/ws';
import { pvpActionEnactedAiChatOutputSchema } from '../schemas/pvp';
import { observationMessageAgentOutputSchema, observationMessageAiChatOutputSchema, observationMessageInputSchema } from '../schemas/observationsMessage';
import { gmMessageAiChatOutputSchema } from '../schemas/gmMessage';
import { gmMessageAgentOutputSchema } from '../schemas/gmMessage';
import { gmMessageInputSchema } from '../schemas/gmMessage';
import { authenticatedMessageSchema } from '../schemas/common';
import { validEthereumAddressSchema } from '../schemas/common';
import { publicChatMessageInputSchema } from '../schemas/publicChat';
import { publicChatMessageOutputSchema } from '../schemas/publicChat';




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

// Room related schemas
export const roomConfigSchema = z.object({
  round_duration: z.number().int().positive(),
  pvp_config: z.object({
    enabled: z.boolean(),
    enabled_rules: z.array(z.string()),
  }),
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
