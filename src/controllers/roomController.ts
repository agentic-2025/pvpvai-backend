import { RoomService } from '../services/roomService';
import { Database } from '../types/database.types';
import { DBRoomAgent, RoomOperationResult } from '../types/roomTypes';

// Initialize service instance
const roomService = new RoomService();

export class RoomController {
  //TODO This was commented out in a rush because we didn't have time to fix type errors, need to come back to it.
  // async setupRoom({
  //   content,
  //   creator_address,
  // }: {
  //   content: z.infer<typeof roomSetupContentSchema>;
  //   creator_address: AddressLike;

  // }): Promise<RoomOperationResult> {
  //   try {
  //     // Create room
  //     const roomData = {
  //       name: content.name,
  //       creator_address: creator_address, // TODO: Should require payload to be signed by creator_address and get this from auth

  //       type_id: 1, // TODO Hardcoded for now, Buy/Hold/Sell type is 1, can get from room_types table later
  //       chain_family: content.chain_family,
  //       chain_id: content.chain_id,
  //       color: content.color,
  //       image_url: content.image_url,
  //       creator_id: 1, // TODO: Get from auth
  //       room_config: content.room_config,
  //       active: true,
  //       status: 'pending',
  //     };

  //     const contractRoom = await contractClient.createRoom({
  //       creator: creator_address,
  //       roomId: roomData.id,
  //       roomConfig: roomData.room_config,
  //     });
  //     // Update agent adding to include wallet addresses
  //     const agentAddPromises = Object.entries(setupData.agents).map(async ([id, { webhook }]) => {
  //       //CREATE WALLET HERE
  //       const result = await createAndSaveWalletToFile(chainIdToNetwork[setupData.chain_id]);
  //       roomService.addAgentToRoom(room.id, parseInt(id), result.address, result.exportedData);
  //     });
  //     for (const agent of content.agents) {
  //       const agentData = {
  //         agent_id: agent,
  //         wallet_address: content.wallet_address,
  //         wallet_json: content.wallet_json,
  //       };
  //     }

  //     const roomResult = await roomService.createRoom(roomData);
  //     if (!roomResult.success) {
  //       return roomResult;
  //     }

  //     // Add agents to room
  //     const room = roomResult.data;
  //     if (!room) {
  //       return { success: false, error: 'Room creation failed' };
  //     }

  //     await Promise.all(agentAddPromises);

  //     return {
  //       success: true,
  //       data: { roomId: room.id },
  //     };
  //   } catch (err) {
  //     console.error('Error in room setup:', err);
  //     return { success: false, error: 'Internal server error' };
  //   }
  // }


  async addAgentToRoom(
    roomId: number,
    agentId: number,
    walletAddress: string,
    endpoint?: string // Make endpoint optional
  ): Promise<RoomOperationResult<DBRoomAgent>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    // Add endpoint to agent data if provided
    return await roomService.addAgentToRoom(roomId, agentId, walletAddress, endpoint);
  }



  async bulkAddAgentsToRoom(
    roomId: number,
    agents: Array<{ id: number; walletAddress: string }>
  ): Promise<RoomOperationResult<DBRoomAgent[]>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    return await roomService.bulkAddAgentsToRoom(roomId, agents);
  }

  async updateOrAddAgentToRoom(
    roomId: number,
    agentId: number,
    walletAddress: string,
    endpoint?: string
  ): Promise<RoomOperationResult<DBRoomAgent>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    // First try to update existing entry
    const updateResult = await roomService.updateAgentInRoom(
      roomId,
      agentId,
      walletAddress,
      endpoint
    );

    // If no existing entry, create new one
    if (!updateResult.success) {
      return await roomService.addAgentToRoom(roomId, agentId, walletAddress, endpoint);
    }

    return updateResult;
  }

  // Add findRoomById method to match RoomService
  async findRoomById(
    roomId: number
  ): Promise<RoomOperationResult<Database['public']['Tables']['rooms']['Row']>> {
    return await roomService.findRoomById(roomId);
  }
}

export const roomController = new RoomController();
