import { FastifyInstance } from 'fastify';
import { roomController } from '../controllers/roomController';
import { roundController } from '../controllers/roundController';
import {
  agentAddSchema,
  agentBulkAddSchema,
  RoomAgentAdd,
  RoomAgentBulkAdd,
  RoomSetup,
  roomSetupSchema,
} from '../utils/schemas';

export async function roomRoutes(server: FastifyInstance) {
  // Setup new room
  server.post<{ Body: RoomSetup }>(
    '/setup',
    {
      schema: {
        body: roomSetupSchema,
      },
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
    Body: { agent_id: number; wallet_address: string };
  }>(
    '/:roomId/agents',
    {
      schema: {
        body: agentAddSchema,
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      const result = await roomController.addAgentToRoom(roomId, request.body.agent_id, request.body.wallet_address);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );

  // Bulk add agents to room
  server.post<{
    Params: { roomId: string };
    Body: { agents: Array<{ id: number; walletAddress: string }> };
  }>(
    '/:roomId/agents/bulk',
    {
      schema: {
        body: agentBulkAddSchema,
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      const result = await roomController.bulkAddAgentsToRoom(roomId, request.body.agents);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );

  // Create a new round in a room
  // This route is used by the GameMasterClient to create a new round in a specific room 
  server.post<{
    Params: { roomId: string };
    Body: { 
      game_master_id?: number;
      round_config?: any;
    };
  }>(
    '/:roomId/rounds',
    {
      schema: {
        params: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
        body: {
          type: 'object',
          properties: {
            game_master_id: { type: 'number' },
            round_config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);
      try {
        const result = await roundController.createRound(roomId, request.body);
        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.status(201).send(result.data);
      } catch (error) {
        console.error('Error creating round:', error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}
