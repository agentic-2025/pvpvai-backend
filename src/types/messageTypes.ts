import { z } from 'zod';
import { agentMessageInputSchema } from '../utils/schemas';

// TEMP
export interface MessageWithContext {
  timestamp: number;
  roomId: number;
  roundId: number;
  agentId: number;
  text: string;
  context?: any[];
}

// Type for processed messages with PvP effects and context
export interface ProcessedAgentMessage extends z.infer<typeof agentMessageInputSchema> {
  content: MessageWithContext;
}
