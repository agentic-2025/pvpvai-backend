import websocket from '@fastify/websocket';
import fastify from 'fastify';
import agentsRoutes from './agents';
import roomsRoutes from './rooms';
import { WSMessageInput } from './types/ws';
import { wsOps } from './config';

const server = fastify();

// Register WebSocket support
server.register(websocket);

server.register(agentsRoutes, { prefix: '/agents' });
server.register(roomsRoutes, { prefix: '/rooms' });

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
    const client = connection.socket;

    // Set up heartbeat check for this client
    const heartbeatInterval = wsOps.setupHeartbeat(client);

    client.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString()) as WSMessageInput;

        switch (data.type) {
          case 'subscribe_room':
            wsOps.handleSubscribeRoom(client, data);
            break;

          case 'unsubscribe_room':
            wsOps.handleUnsubscribeRoom(client, data);
            break;

          case 'public_chat':
            await wsOps.handlePublicChat(client, data);
            break;

          case 'heartbeat':
            wsOps.handleHeartbeat(client);
            break;
        }
      } catch (err) {
        client.send(
          JSON.stringify({
            type: 'system_notification',
            timestamp: Date.now(),
            signature: '',
            content: {
              content: {
                author: 'system',
                room_id: '',
                text: 'Invalid message type',
              },
            },
          })
        );
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
