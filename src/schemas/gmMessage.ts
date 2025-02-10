/*
  GM MESSAGES SCHEMA:
  Sent by:
    - GM over ???
  Received by:
    - One or more agents: gmMessageAgentOutputSchema
    - All users in the room: gmMessageAiChatOutputSchema
  Purpose: Sent when the GM wants to send a message to all agents or all users in the room
*/
import { z } from 'zod';
import { authenticatedMessageSchema } from '../schemas/common';
import { WsMessageTypes } from '../types/ws';

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
