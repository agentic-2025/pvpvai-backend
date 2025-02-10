/*
Small dump for messages used to upkeep the WS Server:
- Heartbeat
- Subscribe Room
- Participants
*/
import { z } from 'zod';
import { WsMessageTypes } from '../types/ws';

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

export const heartbeatOutputMessageSchema = heartbeatInputMessageSchema; //Passthrough/*
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

