import { RoomService } from '../services/roomService';
import { DBRoomAgent, RoomOperationResult } from '../types/roomTypes';
// Initialize service instance
const roomService = new RoomService();

export class RoomController {
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

  async isAgentInRoom(roomId: number, agentId: number): Promise<RoomOperationResult<boolean>> {
    return await roomService.isAgentInRoom(roomId, agentId);
  }

  async addAgentToRoom(
    roomId: number,
    agentId: number,
    walletAddress: string,
    walletJson: any
  ): Promise<RoomOperationResult<DBRoomAgent>> {
    // Validate room exists and is active
    const roomResult = await roomService.findRoomById(roomId);
    if (!roomResult.success || !roomResult.data) {
      return { success: false, error: 'Room not found' };
    }

    if (!roomResult.data.active) {
      return { success: false, error: 'Room is not active' };
    }

    return await roomService.addAgentToRoom(roomId, agentId, walletAddress, walletJson);
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

  // async getAgent(agentId: number) {
  //   try {
  //     const agentData = await coreRead.getAgent(BigInt(agentId));
  //     return agentData;
  //   } catch (error) {
  //     console.error('Error getting agent:', error);
  //     throw error;
  //   }
  // }

  // async createAgent(creator: string, agentId: number, value?: bigint) {
  //   try {
  //     const tx = await coreWrite.createAgent(creator as `0x${string}`, BigInt(agentId), value);
  //     return tx;
  //   } catch (error) {
  //     console.error('Error creating agent:', error);
  //     throw error;
  //   }
  // }
}

export const roomController = new RoomController();
