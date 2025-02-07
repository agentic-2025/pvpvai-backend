import { supabase } from '../config';
import { DBRoomAgent, RoomOperationResult } from '../types/roomTypes';
import { Database, Tables } from '../types/database.types';

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
    agentId: number,
    walletAddress: string,
    walletJson: any
  ): Promise<RoomOperationResult<Database['public']['Tables']['room_agents']['Row']>> {
    try {
      const { data, error } = await supabase
        .from('room_agents')
        .upsert(
          {
            room_id: roomId,
            agent_id: agentId,
            wallet_address: walletAddress,
            wallet_json: walletJson,
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
    } catch (error) {
      console.error('Error adding agent to room:', error);
      return { success: false, error: 'Failed to add agent to room' };
    }
  }

  async bulkAddAgentsToRoom(
    roomId: number,
    agents: Array<{ id: number; walletAddress: string }>
  ): Promise<RoomOperationResult<Database['public']['Tables']['room_agents']['Row'][]>> {
    try {
      const roomAgentsData = agents.map((agent) => ({
        room_id: roomId,
        agent_id: agent.id,
        wallet_address: agent.walletAddress,
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

  async getRoomAgents(roomId: number): Promise<RoomOperationResult<DBRoomAgent[]>> {
    try {
      const { data, error } = await supabase
        .from('room_agents')
        .select('*')
        .eq('room_id', roomId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error getting room agents:', error);
      return { success: false, error: 'Failed to get room agents' };
    }
  }

  async updateAgentInRoom(
    roomId: number,
    agentId: number,
    walletAddress: string,
    endpoint?: string
  ): Promise<RoomOperationResult<DBRoomAgent>> {
    try {
      const { data, error } = await supabase
        .from('room_agents')
        .update({
          wallet_address: walletAddress,
          endpoint: endpoint
        })
        .eq('room_id', roomId)
        .eq('agent_id', agentId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows updated
          return { success: false, error: 'Agent not found in room' };
        }
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error updating agent in room:', error);
      return { success: false, error: 'Failed to update agent in room' };
    }
  }
}

export const roomService = new RoomService();
