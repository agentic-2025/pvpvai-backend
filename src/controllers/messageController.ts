import { z } from 'zod';
import { supabase } from '../config';
import { roundController } from './roundController';
import { processAgentMessage, processGmMessage, processObservationMessage } from '../utils/messageHandler';
import { agentMessageInputSchema, observationMessageInputSchema, gmMessageInputSchema } from '../utils/schemas';
import { ProcessedAgentMessage, MessageWithContext } from '../types/messageTypes';
import { PvPEffect } from '../types/pvp';

export class MessageController {
  private readonly MAX_CONTEXT_MESSAGES = 10;  // Number of previous messages to include as context

  async handleAgentMessage(message: z.infer<typeof agentMessageInputSchema>) {
    const { roundId } = message.content;
    
    // Get active PvP effects for sender
    const roundState = await roundController.getRoundState(roundId);
    const effects = roundState.data?.activePvPEffects || [];
    
    // Check for SILENCE effect
    if (effects.some(effect => 
      effect.actionType === 'SILENCE' && 
      effect.targetId === message.content.agentId
    )) {
      return {
        error: 'Agent is currently silenced',
        statusCode: 403
      };
    }

    // Create processed message with proper typing
    const processedMessage: ProcessedAgentMessage = {
      ...message,
      content: {
        ...message.content,
        context: await this.getMessageContext(roundId)
      }
    };

    // Apply POISON effects
    effects.filter(effect => 
      effect.actionType === 'POISON' && 
      effect.targetId === message.content.agentId
    ).forEach(effect => {
      if (effect.details) {
        processedMessage.content.text = this.applyPoisonEffect(
          processedMessage.content.text,
          effect.details
        );
      }
    });

    return await processAgentMessage(processedMessage);
  }

  async handleObservation(message: z.infer<typeof observationMessageInputSchema>) {
    // Add message context
    const context = await this.getMessageContext(message.content.roundId);
    const processedMessage = {
      ...message,
      content: {
        ...message.content,
        context
      }
    };
    
    return await processObservationMessage(processedMessage);
  }

  async handleGmMessage(message: z.infer<typeof gmMessageInputSchema>) {
    // Add message context
    const context = await this.getMessageContext(message.content.roundId);
    const processedMessage = {
      ...message,
      content: {
        ...message.content,
        context
      }
    };

    return await processGmMessage(processedMessage);
  }

  private async getMessageContext(roundId: number): Promise<any[]> {
    // Get recent messages from both agent and observation tables
    const { data: agentMessages } = await supabase
      .from('round_agent_messages')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at', { ascending: false })
      .limit(this.MAX_CONTEXT_MESSAGES);

    const { data: observations } = await supabase
      .from('round_observations')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at', { ascending: false })
      .limit(this.MAX_CONTEXT_MESSAGES);

    // Merge and sort messages by timestamp
    const context = [...(agentMessages || []), ...(observations || [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, this.MAX_CONTEXT_MESSAGES);

    return context;
  }

  private applyPoisonEffect(
    text: string, 
    details: { find: string; replace: string; case_sensitive?: boolean }
  ): string {
    const flags = details.case_sensitive ? 'g' : 'gi';
    const regex = new RegExp(details.find, flags);
    return text.replace(regex, details.replace);
  }
}

export const messageController = new MessageController();
