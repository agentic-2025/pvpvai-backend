import websocket from '@fastify/websocket';
import fastify from 'fastify';
import agentsRoutes from './agents';
import roomsRoutes from './rooms';
import { WSMessageInput } from './types/ws'; // Fix: Updated import path
import { wsOps } from './config';
import zodSchemaPlugin from './plugins/zodSchema';

// Verify environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const server = fastify();

// Register Zod validation
server.register(zodSchemaPlugin);

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
    console.log('New WebSocket connection established');

    // Set up heartbeat check for this client
    const heartbeatInterval = wsOps.setupHeartbeat(client);

    client.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString()) as WSMessageInput;
        console.log('Received message:', { type: data.type, author: data.author, content: data.content });

        // Validate message format
        if (!data.type || !data.content || !data.author) {
          throw new Error('Invalid message format: missing required fields');
        }

        switch (data.type) {
          case 'subscribe_room':
            console.log('Processing subscribe_room request');
            await wsOps.handleSubscribeRoom(client, data)
              .catch(err => console.error('Subscribe room error:', err));
            break;

          case 'unsubscribe_room':
            console.log('Processing unsubscribe_room request');
            wsOps.handleUnsubscribeRoom(client, data);
            break;

          case 'ai_chat':
            console.log('Processing AI chat message');
            await wsOps.handleAIChat(client, data)
              .catch(err => console.error('Chat handling error:', err));
            break;

          case 'pvp_action':
            console.log('Processing PvP action');
            await wsOps.handlePvPAction(client, data)
              .catch(err => console.error('PvP action error:', err));
            break;

          case 'gm_action':
            console.log('Processing GM action');
            await wsOps.handleGMAction(client, data)
              .catch(err => console.error('GM action error:', err));
            break;

          case 'heartbeat':
            wsOps.handleHeartbeat(client);
            break;

          default:
            console.error(`Unsupported message type: ${data.type}`);
            throw new Error(`Unsupported message type: ${data.type}`);
        }
      } catch (err) {
        console.error('WebSocket message handling error:', err);
        client.send(JSON.stringify({
          type: 'system_notification',
          timestamp: Date.now(),
          signature: '',
          content: {
            text: err instanceof Error ? err.message : 'Invalid message format',
            error: true
          },
        }));
      }
    });

    // Clean up on client disconnect
    client.on('close', () => {
      console.log('WebSocket connection closed');
      wsOps.cleanup(client);
      clearInterval(heartbeatInterval);
    });
  });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await server.listen({ 
      port,
      host: '0.0.0.0' // Listen on all interfaces
    });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) { // Fix: Added err parameter
    console.error('Server failed to start:', err);
    server.log.error(err);
    process.exit(1);
  }
};

// Add global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Start server with error handling
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
