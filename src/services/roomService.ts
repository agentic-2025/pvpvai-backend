import { supabase } from '../config';
import { Database } from '../types/database.types';
import { RoomOperationResult } from '../types/roomTypes';

export class RoomService {
  async isAgentInRoom(roomId: number, agentId: number): Promise<RoomOperationResult<boolean>> {
    try {
      const { data, error } = await supabase
        .from('room_agents')
        .select('*')
        .eq('room_id', roomId)
        .eq('agent_id', agentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found error
          return { success: true, data: false };
        }
        return { success: false, error: error.message };
      }

      return { success: true, data: Boolean(data) };
    } catch (err) {
      console.error('Error checking agent in room:', err);
      return { success: false, error: 'Failed to check agent in room' };
    }
  }

  async findRoomById(
    roomId: number
  ): Promise<RoomOperationResult<Database['public']['Tables']['rooms']['Row']>> {
    try {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error finding room:', err);
      return { success: false, error: 'Failed to find room' };
    }
  }

  async createRoom(
    roomData: Database['public']['Tables']['rooms']['Insert']
  ): Promise<RoomOperationResult<Database['public']['Tables']['rooms']['Row']>> {
    try {
      const { data, error } = await supabase.from('rooms').insert([roomData]).select().single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error creating room:', err);
      return { success: false, error: 'Failed to create room' };
    }
  }

  async addAgentToRoom(
    roomId: number,
    agentId: number
  ): Promise<RoomOperationResult<Database['public']['Tables']['room_agents']['Row']>> {
    try {
      const { data, error } = await supabase
        .from('room_agents')
        .upsert(
          {
            room_id: roomId,
            agent_id: agentId,
          },
          {
            onConflict: 'room_id,agent_id',
          }
        )
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error adding agent to room:', err);
      return { success: false, error: 'Failed to add agent to room' };
    }
  }

  async bulkAddAgentsToRoom(
    roomId: number,
    agentIds: number[]
  ): Promise<RoomOperationResult<Database['public']['Tables']['room_agents']['Row'][]>> {
    try {
      const roomAgentsData = agentIds.map((agentId) => ({
        room_id: roomId,
        agent_id: agentId,
      }));

      const { data, error } = await supabase
        .from('room_agents')
        .upsert(roomAgentsData, {
          onConflict: 'room_id,agent_id',
        })
        .select();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error bulk adding agents:', err);
      return { success: false, error: 'Failed to bulk add agents' };
    }
  }
}

export const roomService = new RoomService();
