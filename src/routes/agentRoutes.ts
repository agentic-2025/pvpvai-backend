import { FastifyInstance } from 'fastify';
import { supabase } from '../config';
import { Database, Tables } from '../types/database.types';

export async function agentRoutes(server: FastifyInstance) {
  // Create new agent
  server.post<{
    Body: Database['public']['Tables']['agents']['Insert'];
    Reply: { data?: Tables<'agents'>; error?: string };
  }>('', async (request, reply) => {
    try {
      const agentData = request.body;
      const { data: agent, error } = await supabase
        .from('agents')
        .insert(agentData)
        .select()
        .single();

      if (error) {
        console.error('Error inserting agent:', error);
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(201).send({ data: agent });
    } catch (err) {
      console.error('Error in /agents POST:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
