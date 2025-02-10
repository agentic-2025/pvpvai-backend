/*
Small dump for messages used to upkeep the WS Server:
- Heartbeat
- Subscribe Room
- Participants
*/
import { z } from 'zod';

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

  // Sent by: GM
  // Purpose: Instruct agents to submit their decision
  GM_INSTRUCT_DECISION = 'gm_instruct_decision',

  //Sent by: GM
  // Purpose: tells agents to download the latest round and set context
  GM_REINIT = 'gm_reinit',

  // Response to: Any WS input message
  // Recipients: Single user
  // Purpose: Send a message to an individual user to inform them of something, typically used to notify of a failed action they took or a system error
  SYSTEM_NOTIFICATION = 'system_notification',

  // Response to: POST request to /rooms/:roomId/rounds/:roundId/observations
  // Recipients: Users
  // Purpose: Send an observation to all agents in the room
  // Dual purpose: Message is relayed to AI Chat to inform subscribed users of an observation presented to the agents
  OBSERVATION = 'observation',

  // Response to: POST request to /rounds/:roundId/pvp
  // Recipients: Users
  // Purpose: Informs users that a PvP action has been applied to an agent, be it a direct action or a status effect
  PVP_ACTION_ENACTED = 'pvp_action_enacted',

  // Response to: None (background process monitors when a PvP status is removed and notifies users)
  // Recipients: Users
  // Purpose: Informs users that a PvP status has been removed from an agent
  PVP_STATUS_REMOVED = 'pvp_status_removed',

  // Response to: POST request to /agents
  // Recipients: N/A
  // Purpose: Not sent by anyone, just the type used for the payload of the request to POST /agents
  CREATE_AGENT = 'create_agent',

  // Response to: POST request to /rooms
  // Recipients: N/A
  // Purpose: Not sent by anyone, just the type used for the payload of the request to POST /rooms
  CREATE_ROOM = 'create_room',

  // Response to: POST request to /rounds
  // Recipients: N/A
  // Purpose: Not sent by anyone, just the type used for the payload of the request to POST /rounds
  AGENT_NUDGE = 'agent_nudge',
  AGENT_DECISION = 'agent_decision',
}

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
