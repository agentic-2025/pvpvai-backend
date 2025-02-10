import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { CronJob } from 'cron';
import fastify from 'fastify';
import { checkAndCloseRounds, checkAndCreateRounds, syncAgentsWithActiveRounds } from './bg-sync';
import { supabase, wsOps } from './config';
import { startContractEventListener } from './contract-event-listener';
import { roundController } from './controllers/roundController';
import { signatureVerificationPlugin } from './middleware/signatureVerification';
import zodSchemaPlugin from './plugins/zodSchema';
import roomsRoutes from './rooms';
import { agentRoutes } from './routes/agentRoutes';
import { messagesRoutes } from './routes/messageRoutes';
import { roundRoutes } from './routes/roundRoutes';
import { WsMessageTypes } from './types/ws';
import { AllInputSchemaTypes } from './utils/schemas';
// Add type declaration for the custom property
declare module 'fastify' {
  interface FastifyRequest {
    verifiedAddress: string;
  }
}

const server = fastify({
  logger: true,
});

// Register core plugins
server.register(cors, {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  origin: '*',
});
server.register(zodSchemaPlugin);
server.register(websocket);

// Register all routes with proper organization
server.register(async function (fastify) {
  // Base routes
  fastify.get('/', async () => ({ hello: 'world' }));
  fastify.get('/ping', async () => 'pong\n');

  // Protected route example
  fastify.post(
    '/protected-hello',
    {
      preHandler: signatureVerificationPlugin,
    },
    async (request, reply) => {
      const body = request.body as any;
      return {
        message: 'Hello, verified user!',
        account: body.account,
        data: body.data,
      };
    }
  );

  // Fix: Update route registration to avoid conflicts
  fastify.register(roomsRoutes, { prefix: '/rooms' }); // Handles /rooms/
  fastify.register(agentRoutes, { prefix: '/agents' }); // Handles /agents/
  fastify.register(messagesRoutes, { prefix: '/messages' }); // Handles /messages/
  fastify.register(roundRoutes, { prefix: '/rooms/:roomId/rounds' }); // Handles /rooms/:roomId/rounds/*
});

// Register WebSocket handler
server.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const client = connection;

    // Set up heartbeat check for this client
    const heartbeatInterval = wsOps.setupHeartbeat(client);

    client.on('message', async (message: Buffer) => {
      try {
        const data: AllInputSchemaTypes = JSON.parse(message.toString());
        console.log(`Received ${data.messageType} message...`);

        switch (data.messageType) {
          case WsMessageTypes.SUBSCRIBE_ROOM:
            console.log('Handling subscribe room:', JSON.parse(message.toString()));
            wsOps.handleSubscribeRoom(client, data);
            break;

          case WsMessageTypes.PARTICIPANTS:
            wsOps.handleParticipants(client, data);
            break;

          case WsMessageTypes.PUBLIC_CHAT:
            await wsOps.handlePublicChat(client, data);
            break;

          case WsMessageTypes.HEARTBEAT:
            wsOps.handleHeartbeat(client);
            break;

          case WsMessageTypes.GM_MESSAGE:
            console.log('Handling GM message:', data);
            await wsOps.handleGmMessage(client, data);
            break;

          default:
            wsOps.sendSystemMessage(
              client,
              'Invalid message type ' +
                data.messageType +
                ', please pass a supported message type:' +
                Object.values(WsMessageTypes).join(', '),
              true,
              data
            );
        }
      } catch (err) {
        wsOps.sendSystemMessage(client, 'Hit error handling message: ' + err, true, message);
      }
    });

    // Clean up on client disconnect
    client.on('close', () => {
      wsOps.cleanup(client);
      clearInterval(heartbeatInterval);
    });
  });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await server.listen({ port });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
startContractEventListener();

const job = new CronJob('*/25 * * * * *', checkAndCreateRounds);
job.start();
const job2 = new CronJob('*/20 * * * * *', checkAndCloseRounds);
job2.start();
// const job3 = new CronJob('*/15 * * * * *', syncAgentsWithActiveRounds);
// job3.start();

//TODO Below was a hack to debug a repeat loop I was getting with agentMonitorService, should be moved back to agentMonitorService
const agentMonitorService = async () => {
  try {
    // Get all rounds that need monitoring
    const { data: activeRooms, error } = await supabase
      .from('rooms')
      .select(
        `
        *,
        room_agents!inner(id, agent_id, last_message)
      `
      )
      .eq('active', true)
      .or(`last_message.is.null,last_message.lt.${new Date(Date.now() - 30000).toISOString()}`);

    if (error || !activeRooms?.length) return;

    // Process each active round
    for (const room of activeRooms) {
      // Delegates to roundController which:
      // 1. Verifies round is still active
      // 2. Calls messageHandler.processInactiveAgents
      // 3. Handles notification delivery
      await roundController.checkInactiveAgents(room.id);
    }
  } catch (error) {
    console.error('Error in agent monitor service:', error);
  }
};
const job4 = new CronJob('*/30 * * * * *', agentMonitorService);
job4.start();
