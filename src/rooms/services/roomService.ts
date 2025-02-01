// src/rooms/services/roomService.ts
import { supabase } from '../../config';
import { RoomOperationResult, DBRoom, DBRoomInsert, DBRoomAgent } from '../types/roomTypes';

export class RoomService {
  async createRoom(roomData: DBRoomInsert): Promise<RoomOperationResult<DBRoom>> {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .insert(roomData)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: room };
    } catch (err) {
      console.error('Error in createRoom:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async findRoomById(roomId: number): Promise<RoomOperationResult<DBRoom>> {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .select()
        .eq('id', roomId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: room };
    } catch (err) {
      console.error('Error in findRoomById:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async addAgentToRoom(roomId: number, agentId: number): Promise<RoomOperationResult<DBRoomAgent>> {
    try {
      const { data: roomAgent, error } = await supabase
        .from('room_agents')
        .upsert({
          room_id: roomId,
          agent_id: agentId,
        }, {
          onConflict: 'room_id,agent_id',
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: roomAgent };
    } catch (err) {
      console.error('Error in addAgentToRoom:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async bulkAddAgentsToRoom(roomId: number, agentIds: number[]): Promise<RoomOperationResult<DBRoomAgent[]>> {
    try {
      const roomAgentsData = agentIds.map(agentId => ({
        room_id: roomId,
        agent_id: agentId,
      }));

      const { data: roomAgents, error } = await supabase
        .from('room_agents')
        .upsert(roomAgentsData, {
          onConflict: 'room_id,agent_id',
        })
        .select();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: roomAgents };
    } catch (err) {
      console.error('Error in bulkAddAgentsToRoom:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async getRoomAgents(roomId: number): Promise<RoomOperationResult<DBRoomAgent[]>> {
    try {
      const { data: roomAgents, error } = await supabase
        .from('room_agents')
        .select('*')
        .eq('room_id', roomId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: roomAgents };
    } catch (err) {
      console.error('Error in getRoomAgents:', err);
      return { success: false, error: 'Internal server error' };
    }
  }

  async updateRoom(roomId: number, updateData: Partial<DBRoomInsert>): Promise<RoomOperationResult<DBRoom>> {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .update(updateData)
        .eq('id', roomId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: room };
    } catch (err) {
      console.error('Error in updateRoom:', err);
      return { success: false, error: 'Internal server error' };
    }
  }
}

export const roomService = new RoomService();