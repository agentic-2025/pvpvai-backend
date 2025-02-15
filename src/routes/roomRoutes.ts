import { ethers } from 'ethers';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contractClient, supabase } from '../config';
import { roomService } from '../services/roomService';
import { agentAddSchema, agentBulkAddSchema, roomSetupSchema } from '../utils/schemas';
import { chainIdToNetwork, createAndSaveWalletToFile } from '../utils/walletUtils';

export async function roomRoutes(server: FastifyInstance) {
  // Setup new room
  server.post<{ Body: z.infer<typeof roomSetupSchema> }>(
    '/setup',
    {
      schema: {
        body: roomSetupSchema,
      },
    },
    async (request, reply) => {
      // TODO check that every specified agent is registered on the contract
      // DB is a good enough source of truth for now since all create agent requests should come through POST /agents
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .in('id', request.body.content.agents);
      if (agentsError) {
        return reply.status(400).send({
          error: 'Failed to create room, error fetching agents from DB: ' + agentsError.message,
        });
      }
      const { data: gm, error: gmError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', request.body.content.gm)
        .single();
      if (gmError) {
        return reply
          .status(400)
          .send({ error: 'Failed to create room, error fetching GM from DB: ' + gmError.message });
      }

      const newAgentWallets = [];
      for (const agent of agents) {
        const result = await createAndSaveWalletToFile(
          chainIdToNetwork[request.body.content.chain_id]
        );
        //register agent wallet on contract
        const tx = await contractClient.registerAgentWallet({
          agentId: BigInt(agent.id),
          altWallet: result.address as `0x${string}`,
        });
        console.log('Registered agent wallet on contract', tx);
        newAgentWallets.push({
          address: result.address,
        });
      }
      // Create new wallets for every agent with coinbase
      const agentWallets = await Promise.all(
        agents.map(async (agent) => {
          const wallet = await ethers.Wallet.createRandom();
          return {
            address: wallet.address,
            privateKey: wallet.privateKey,
          };
        })
      );

      const roomContract = await contractClient.createRoom({
        gameMaster: gm.eth_wallet_address as `0x${string}`,
        creator: request.verifiedAddress as `0x${string}`,
        tokenAddress: request.body.content.token as `0x${string}`,
        roomAgentWallets: agents.map((agent) => agent.eth_wallet_address as `0x${string}`),
        roomAgentFeeRecipients: agents.map((agent) => agent.eth_wallet_address as `0x${string}`),
        roomAgentIds: agents.map((agent) => BigInt(agent.id)),
      });

      // Create room in DB
      // const result = await roomController.setupRoom({
      //   ...request.body.content,
      //   creator_address: request.verifiedAddress,
      // });
      // Set agent wallets

      // if (!result.success) {
      //   return reply.status(400).send({ error: result.error });
      // }
      // return reply.send(result.data);
      return reply.send({});
    }
  );

  // Add single agent to room
  server.post<{
    Params: { roomId: string };
    Body: { agent_id: number; wallet_address: string; wallet_json: any };
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
      const result = await roomService.addAgentToRoom(
        roomId,
        request.body.agent_id,
        request.body.wallet_address,
        request.body.wallet_json
      );
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
      const result = await roomService.bulkAddAgentsToRoom(roomId, request.body.agents);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.send(result.data);
    }
  );

  // Get room details
  server.get<{
    Params: { roomId: string };
  }>(
    '/:roomId',
    {
      schema: {
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
      const result = await roomService.findRoomById(roomId);

      if (!result.success) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({
        success: true,
        data: result.data,
      });
    }
  );

  // Get all rounds in a room
  server.get<{
    Params: { roomId: string };
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
      },
    },
    async (request, reply) => {
      const roomId = parseInt(request.params.roomId);

      // First verify room exists
      const roomResult = await roomService.findRoomById(roomId);
      if (!roomResult.success) {
        return reply.status(404).send({ error: 'Room not found' });
      }

      try {
        const { data: rounds, error } = await supabase
          .from('rounds')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false });

        if (error) {
          return reply.status(500).send({ error: error.message });
        }

        return reply.send({
          success: true,
          data: rounds,
        });
      } catch (error) {
        console.error('Error fetching rounds:', error);
        return reply.status(500).send({
          error: 'Failed to fetch rounds',
        });
      }
    }
  );
}
