import { wsOps } from '../../config';
import { applyPvp } from '../../pvp';
import { roundService } from '../services/roundService';
import { RoomOperationResult } from '../types/roomTypes';
import { RoundDataDB } from '../types/roundTypes';

export class RoundController {
  async getOrCreateActiveRound(roomId: number): Promise<RoomOperationResult<RoundDataDB>> {
    return await roundService.getOrCreateActiveRound(roomId);
  }

  // the body of processAgentMessage was moved to roundController.ts since, currently, agent messages only come in over REST
  // can move that functionality back to a common method later when/if we support agent sending message over WS

  async endRound(roundId: number, outcome?: any): Promise<RoomOperationResult<void>> {
    return await roundService.endRound(roundId, outcome);
  }

  async kickParticipant(roundId: number, agentId: number): Promise<RoomOperationResult<void>> {
    return await roundService.kickParticipant(roundId, agentId);
  }
}

export const roundController = new RoundController();
