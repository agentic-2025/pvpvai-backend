import { wsOps } from '../../config';
import { applyPvp } from '../../pvp';
import { roundService } from '../services/roundService';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB } from '../types/roundTypes';

export class RoundController {
  async getOrCreateActiveRound(roomId: number): Promise<RoomOperationResult<RoundDataDB>> {
    return await roundService.getOrCreateActiveRound(roomId);
  }

  
  async processAgentMessage(
    roomId: number,
    roundId: number,
    agentId: number,
    message: any,
    timestamp: number,
    signature: string
  ): Promise<RoomOperationResult<void>> {
    try {
      // Store original message
      const messageResult = await roundService.storeRoundMessage(roundId, agentId, message);
      if (!messageResult.success || !messageResult.data) {
        return { success: false, error: 'Failed to store message' };
      }

      // Apply PvP rules
      const { message: modifiedMessage, targets } = await applyPvp(message,
        agentId,
        [] // Target agents will be determined by PvP rules
      );

      if (!modifiedMessage) {
        return { success: true }; // Message blocked by PvP
      }

      // Broadcast to WebSocket clients
      const wsMessage: WSMessageOutput = {
        type: WsMessageType.AI_CHAT,
        timestamp,
        signature,
        content: {
          roomId,
          roundId,
          messageId: messageResult.data.id,
          actor: agentId.toString(),
          sent: timestamp,
          content: modifiedMessage,
          timestamp,
          altered: message !== modifiedMessage,
        } as AIChatContent,
      };

      await wsOps.broadcastToRoom(roomId, wsMessage);

      return { success: true };
    } catch (err) {
      console.error('Error processing agent message:', err);
      return { success: false, error: 'Failed to process message' };
    }
  }

  async endRound(roundId: number, outcome?: any): Promise<RoomOperationResult<void>> {
    return await roundService.endRound(roundId, outcome);
  }

  async kickParticipant(roundId: number, agentId: number): Promise<RoomOperationResult<void>> {
    return await roundService.kickParticipant(roundId, agentId);
  }
}

export const roundController = new RoundController();
