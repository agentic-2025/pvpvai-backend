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

  // Sent by: Game Master (GM)
  // Purpose: High-priority GM message to agents
  // Requires: gmId, roomId, roundId, message
  GM_MESSAGE = 'gm_message',

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
}

// Remove duplicate GmMessage interface since it's defined in schemas.ts
