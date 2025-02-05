import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastify from 'fastify';
import { wsOps } from './config';
import { signatureVerificationPlugin } from './middleware/signatureVerification';
import zodSchemaPlugin from './plugins/zodSchema';
import roomsRoutes from './rooms';
import { agentRoutes } from './routes/agentRoutes';
import { messagesRoutes } from './routes/messageRoutes';
import { roundRoutes } from './routes/roundRoutes';
import { WsMessageTypes } from './types/ws';
import { AllInputSchemaTypes } from './utils/schemas';

const server = fastify({
  logger: true,
});
server.register(cors, {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  origin: '*',
});

// Register Zod validation
server.register(zodSchemaPlugin);

// Register WebSocket support
server.register(websocket);

server.register(agentRoutes, { prefix: '/agents' });
server.register(roomsRoutes, { prefix: '/rooms' });
server.register(messagesRoutes, { prefix: '/messages' });
server.register(roundRoutes, { prefix: '/rounds' });

// Register routes

// Instead of registering the middleware globally, apply it directly to the protected route
server.post(
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

// Regular HTTP routes
server.get('/', async (request, reply) => {
  return { hello: 'world' };
});

server.get('/ping', async (request, reply) => {
  return 'pong\n';
});

// WebSocket route
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


