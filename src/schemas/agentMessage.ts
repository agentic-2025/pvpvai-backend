import { z } from 'zod';
import { authenticatedMessageSchema } from './common';
import { WsMessageTypes } from './wsServer';
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
}); // Message sent to agents, only difference between input and output message is that the output message's signature will be from the GM
export const agentMessageAgentOutputSchema = agentMessageInputSchema; // Message sent to AI Chat (players) includes PvP details
export const agentMessageAiChatOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    senderId: z.number(),
    originalMessage: agentMessageInputSchema,
    originalTargets: z.array(z.number()),
    currentBlockTimestamp: z.number(),
    postPvpMessages: z.record(z.string(), agentMessageAgentOutputSchema),
    pvpStatusEffects: z.record(z.string(), z.array(z.object({
      verb: z.string(),
      parameters: z.any(),
      endTime: z.number(),
      instigator: z.string(),
    }))), //TODO replace with actual PvP status effect schema
  }),
});
