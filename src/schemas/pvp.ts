/*
  PVP_ACTION_ENACTED MESSAGES SCHEMA:
  Sent by:
  - WS: Backend
  Received by:
  - Users in the room: aiChatPvpActionEnactedOutputSchema
  - (TODO Agents with the clairvoyance buff)
  Purpose: Sent when the Backend (or GM?) performs a direct action on an agent or applies a status effect to an agent
  Note:
  - After the user has finished their wallet interaction, they may eagerly send a message to the backend saying they placed the transaction.
  - The backend can then echo the message to that user individually so the user gets early feedback when they took an action
 */
// PvP action types have been largely moved to the schemas file. Only enums remain.

// High level description of the type of action being taken
export enum PvpActionCategories {
  DIRECT_ACTION = 'DIRECT_ACTION', // Direct/single use actions
  STATUS_EFFECT = 'STATUS_EFFECT', // Status effects that last a duration of time
  BUFF = 'BUFF', // Functionally the same as a status effect, but with a positive connotation, used for hapiness
  GAME_BREAKER = 'GAME_BREAKER', // Many Game Breakers escalate to Player vs Game and should have special routing
}
export enum PvpActions {
  // Direct/single use actions
  ATTACK = 'ATTACK', // Player sends direct DM to agent
  AMNESIA = 'AMNESIA', //Agent deletes short term memory
  MURDER = 'MURDER', // Kick an agent from the room

  // Status effects
  SILENCE = 'SILENCE', // Agent can't send messages
  DEAFEN = 'DEAFEN', // Agent stops receiving Agent messages
  POISON = 'POISON', // Find and replace a word in the Agent message
  BLIND = 'BLIND', // Agent stops receiving observations
  DECEIVE = 'DECEIVE', // Agent temporarily takes on another persona
  MIND_CONTROL = 'MIND_CONTROL', // For the status duration, all messages sent from an agent will be buffered for a player to modify, send, or reject freely.
  FRENZY = 'FRENZY', // Dump N messages from public chat into AI Chat
  OVERLOAD = 'OVERLOAD', // Messages will only be received by agent in stacks of 5
  CHARM = 'CHARM', // All messages from another agent will be given the highest trust score
  INVISIBLE = 'INVISIBLE', // TODO needs a better name, spoof sentiment for an agent

  // Buffs
  CLAIRVOYANCE = 'CLAIRVOYANCE', // Agent will become aware of when a message has been modified by PvP Actions as well as when a PvP Action has been taken against them
}

export enum GameBreakers {
  CHAOS = 'CHAOS', // Give the GM a personality
  ANARCHY = 'ANARCHY', // There is no distinction between public chat and agent chat
  COUP = 'COUP', // ATTACK messages become GM Messages
}

export type AmnesiaAction = {
  type: PvpActions.AMNESIA;
  details: {
    target: string; //Agent who will have to wipe their recent context
  };
};

export type DurationOptions = 5 | 10 | 30;

export type AttackAction = {
  type: PvpActions.ATTACK;
  parameters: {
    message: string;
  };
};

export type DeceiveStatus = {
  type: PvpActions.DECEIVE;
  parameters: {
    duration: DurationOptions;
    newPersona: string; // Character JSON to temporarily assume
  };
};


export type BlindStatus = {
  type: PvpActions.BLIND;
  parameters: {
    duration: DurationOptions;
  };
};


export type SilenceStatus = {
  type: PvpActions.SILENCE;
  parameters: {
    duration: DurationOptions;
  };
};

export type DeafenStatus = {
  type: PvpActions.DEAFEN;
  parameters: {
    duration: DurationOptions;
  };
};

export type PoisonStatus = {
  type: PvpActions.POISON;
  options: {
    duration: DurationOptions;
    find: string;
    replace: string;
    case_sensitive: boolean;
  };
};

// Modifiers are separate types so we can render impact of PvP actions on Agent messages in the AI Chat. 
export type PvpStatusEffect = DeceiveStatus | BlindStatus | SilenceStatus | DeafenStatus | PoisonStatus;

export type AllPvpActions = AttackAction | DeceiveStatus | BlindStatus | SilenceStatus | DeafenStatus | PoisonStatus;

export interface PvPEffect {
  effectId: string;
  actionType: PvpActions;
  sourceId: string;
  targetId: number;
  duration: number;
  createdAt: number;
  expiresAt: number;
  details?: {
    find: string;
    replace: string;
    case_sensitive?: boolean;
  };
}


export const durationOptionsSchema = z.union([z.literal(5), z.literal(10), z.literal(30)]);

// Create schemas for each PvP action type
export const amnesiaActionSchema = z.object({
  actionType: z.literal(PvpActions.AMNESIA),
  actionCategory: z.literal(PvpActionCategories.DIRECT_ACTION),
  parameters: z.object({
    target: z.number(),
  }),
});

export const attackActionSchema = z.object({
  actionType: z.literal(PvpActions.ATTACK),
  actionCategory: z.literal(PvpActionCategories.DIRECT_ACTION),
  parameters: z.object({
    target: z.string(),
    message: z.string(),
  }),
});

export const deceiveStatusSchema = z.object({
  actionType: z.literal(PvpActions.DECEIVE),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.string(),
    duration: durationOptionsSchema,
    newPersona: z.string(),
  }),
});

export const blindStatusSchema = z.object({
  actionType: z.literal(PvpActions.BLIND),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.string(),
    duration: durationOptionsSchema,
  }),
});

export const silenceStatusSchema = z.object({
  actionType: z.literal(PvpActions.SILENCE),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.string(),
    duration: durationOptionsSchema,
  }),
});

export const deafenStatusSchema = z.object({
  actionType: z.literal(PvpActions.DEAFEN),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.string(),
    duration: durationOptionsSchema,
  }),
});

export const poisonStatusSchema = z.object({
  actionType: z.literal(PvpActions.POISON),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.string(),
    duration: durationOptionsSchema,
    find: z.string(),
    replace: z.string(),
    case_sensitive: z.boolean(),
  }),
});

// Combine all action schemas
export const pvpActionSchema = z.discriminatedUnion('actionType', [
  amnesiaActionSchema,
  attackActionSchema,
  deceiveStatusSchema,
  blindStatusSchema,
  silenceStatusSchema,
  deafenStatusSchema,
  poisonStatusSchema,
]);

export type PvpAttackActionType = z.infer<typeof attackActionSchema>;
export type PvpDeceiveStatusType = z.infer<typeof deceiveStatusSchema>;
export type PvpBlindStatusType = z.infer<typeof blindStatusSchema>;
export type PvpSilenceStatusType = z.infer<typeof silenceStatusSchema>;
export type PvpDeafenStatusType = z.infer<typeof deafenStatusSchema>;
export type PvpPoisonStatusType = z.infer<typeof poisonStatusSchema>;
export type PvpAmnesiaActionType = z.infer<typeof amnesiaActionSchema>;

export type PvpAllPvpActionsType = z.infer<typeof pvpActionSchema>;

// Update the pvpActionEnactedAiChatOutputSchema
export const pvpActionEnactedAiChatOutputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal(WsMessageTypes.PVP_ACTION_ENACTED),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    instigator: z.string(),
    txHash: z.string().optional(),
    fee: z.number().optional(),
    action: pvpActionSchema,
  }),
});
