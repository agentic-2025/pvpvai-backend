import { RoomService } from '../services/roomService';
import { DBRoomAgent, RoomOperationResult, RoomSetupData } from '../types/roomTypes';

// Initialize service instance
const roomService = new RoomService();

export class RoomController {
  async setupRoom(setupData: RoomSetupData): Promise<RoomOperationResult> {
    try {
      // Create room
      const roomData = {
        name: setupData.name,
        type_id: 1, // Assuming Buy/Hold/Sell type is 1
        chain_family: setupData.chain_family,
        chain_id: parseInt(setupData.chain_id),
        color: setupData.color,
        image_url: setupData.image_url,
        creator_id: 1, // TODO: Get from auth
        room_config: setupData.room_config,
        active: true,
      };

      const roomResult = await roomService.createRoom(roomData);
      if (!roomResult.success) {
        return roomResult;
      }

      // Add agents to room
      const room = roomResult.data;
      if (!room) {
        return { success: false, error: 'Room creation failed' };
      }

      const agentAddPromises = Object.entries(setupData.agents).map(([id, { wallet, webhook }]) =>
        roomService.addAgentToRoom(room.id, parseInt(id))
      );

      await Promise.all(agentAddPromises);

      return {
        success: true,
        data: { roomId: room.id },
      };
    } catch (err) {
      console.error('Error in room setup:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async isAgentInRoom(roomId: number, agentId: number): Promise<RoomOperationResult<boolean>> {
    return await roomService.isAgentInRoom(roomId, agentId);
  }

  async addAgentToRoom(roomId: number, agentId: number): Promise<RoomOperationResult<DBRoomAgent>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    return await roomService.addAgentToRoom(roomId, agentId);
  }

  async bulkAddAgentsToRoom(
    roomId: number,
    agentIds: number[]
  ): Promise<RoomOperationResult<DBRoomAgent[]>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    return await roomService.bulkAddAgentsToRoom(roomId, agentIds);
  }
}

export const roomController = new RoomController();
