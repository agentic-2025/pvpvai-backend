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
import { z } from 'zod';
import { authenticatedMessageSchema } from '../schemas/common';

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
