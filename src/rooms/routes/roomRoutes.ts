import { FastifyInstance } from 'fastify';
import { roomController } from '../controllers/roomController';
import {
  roomSetupSchema,
  agentAddSchema,
  agentBulkAddSchema,
  RoomSetup,
  RoomAgentAdd,
  RoomAgentBulkAdd
} from '../validators/schemas';

export async function roomRoutes(server: FastifyInstance) {
  // Setup new room
  server.post<{ Body: RoomSetup }>(
    '/setup',
    {
      schema: {
        body: roomSetupSchema
      }
    },
    async (request, reply) => {
      const result = await roomController.setupRoom(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );

  // Add single agent to room
  server.post<{
    Params: { roomId: string };
    Body: RoomAgentAdd;
  }>(
    '/:roomId/agents',
    {
      schema: {
        body: agentAddSchema,
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      const result = await roomController.addAgentToRoom(roomId, request.body.agent_id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );

  // Bulk add agents to room
  server.post<{
    Params: { roomId: string };
    Body: RoomAgentBulkAdd;
  }>(
    '/:roomId/agents/bulk',
    {
      schema: {
        body: agentBulkAddSchema,
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      const result = await roomController.bulkAddAgentsToRoom(roomId, request.body.agent_ids);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );
}