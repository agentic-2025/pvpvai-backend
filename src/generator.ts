import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { Wallet } from 'ethers';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { backendEthersSigningWallet } from './config';
import { Database } from './types/database.types';
import { WsMessageTypes } from './types/ws';
import {
  agentMessageInputSchema,
  gmMessageInputSchema,
  participantsInputMessageSchema,
  publicChatMessageInputSchema,
} from './utils/schemas';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:3000/ws';
const MIN_DELAY = 1000;
const MAX_DELAY = 5000;
const NUM_TEST_USERS = 3;
const CONNECTIONS_PER_USER = 5;
const RECONNECT_INTERVAL = 10000;
const BAD_MESSAGE_PROBABILITY = 0.005;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const randomDelay = () => Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;

const sampleMessages = [
  'Hello everyone!',
  "How's it going?",
  'This is a test message',
  'Having fun in the game!',
  'Good luck all!',
  'Nice move!',
  'Interesting strategy...',
  'Well played!',
];

const sampleGMActions = [
  'Kicked player for inactivity',
  'Started new round',
  'Paused game',
  'Resumed game',
  'Changed game settings',
];

const samplePVPActions = [
  { type: 'Silence', message: 'Silenced for spamming' },
  { type: 'Deafen', message: 'Deafened for ignoring warnings' },
  { type: 'Attack', message: 'Direct attack!' },
  { type: 'Poison', message: 'Message altered' },
] as const;

const sampleAIMessages = [
  'Analyzing market conditions...',
  'Detected unusual trading pattern',
  'Recommending portfolio rebalancing',
  'Market sentiment is positive',
  'Risk level increasing',
];

const sampleGMMessages = [
  'Starting new round...',
  'Round ended',
  'Game paused for maintenance',
  'Increasing difficulty',
  'Special event starting soon',
  'Bonus rewards activated',
  'Tournament phase beginning',
  'Final countdown initiated',
];

const sampleAgentMessages = [
  'Analyzing market trends...',
  'Executing trading strategy',
  'Monitoring price movements',
  'Adjusting position sizes',
  'Evaluating risk parameters',
];

const getRandomMessage = () => sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
const getRandomPVPAction = () =>
  samplePVPActions[Math.floor(Math.random() * samplePVPActions.length)];
const getRandomAIMessage = () =>
  sampleAIMessages[Math.floor(Math.random() * sampleAIMessages.length)];
const getRandomGMMessage = () =>
  sampleGMMessages[Math.floor(Math.random() * sampleGMMessages.length)];
const getRandomAgentMessage = () =>
  sampleAgentMessages[Math.floor(Math.random() * sampleAgentMessages.length)];

async function getTestUsers() {
  const { data: users, error } = await supabase.from('users').select('id').limit(NUM_TEST_USERS);

  if (error) {
    console.error('Error fetching test users:', error);
    return null;
  }

  if (!users || users.length === 0) {
    console.error('No users found in database');
    return null;
  }

  return users.map((user) => user.id);
}

const getRandomUser = (users: number[]) => users[Math.floor(Math.random() * users.length)];

async function getActiveRoomAndRound() {
  const { data: rounds, error: roundError } = await supabase
    .from('rounds')
    .select(
      `
      id,
      room_id,
      active
    `
    )
    .eq('active', true)
    .limit(1)
    .single();

  if (roundError || !rounds) {
    console.error('No active rounds found:', roundError);
    return null;
  }

  return {
    roomId: rounds.room_id,
    roundId: rounds.id,
  };
}

function generateBadMessage(): Partial<any> {
  const badMessages = [
    { type: 'invalid_type' },
    { type: 'public_chat', content: {} },
    { type: 'public_chat', content: { roomId: 'not_a_number' } },
    { type: 'subscribe_room' },
    {},
    null,
    undefined,
  ];
  return badMessages[Math.floor(Math.random() * badMessages.length)];
}

interface Connection {
  ws: WebSocket;
  userId: number;
  wallet: Wallet;
  isSubscribed: boolean;
  currentRoom: { roomId: number; roundId: number } | null;
}

async function signMessage(content: any): Promise<string> {
  // Convert content to string and hash it
  const messageStr = JSON.stringify(content);
  const messageHash = Wallet.hashMessage(messageStr);
  return messageHash;
}

async function generateMessages() {
  const testUsers = await getTestUsers();
  if (!testUsers) {
    console.error('Failed to get test users, exiting...');
    return;
  }

  console.log(`Using test users:`, testUsers);

  const connections: Connection[] = [];

  function createConnection(userId: number): Connection {
    const ws = new WebSocket(WEBSOCKET_URL);
    // Create a random wallet for this connection
    const wallet = Wallet.createRandom();

    const connection: Connection = {
      ws,
      userId,
      wallet,
      isSubscribed: false,
      currentRoom: null,
    };

    ws.on('open', () => {
      console.log(`Connection opened for user ${userId}`);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`User ${userId} received message:`, message);
      if (message.type === WsMessageTypes.HEARTBEAT) {
        ws.send(JSON.stringify({ type: WsMessageTypes.HEARTBEAT, content: {} }));
      }
    });

    ws.on('error', console.error);
    ws.on('close', () => {
      console.log(`Connection closed for user ${userId}, reconnecting...`);
      const index = connections.indexOf(connection);
      if (index > -1) {
        connections.splice(index, 1);
      }
      setTimeout(() => {
        connections.push(createConnection(userId));
      }, 5000);
    });

    return connection;
  }

  // Initialize connections
  testUsers.forEach((userId) => {
    for (let i = 0; i < CONNECTIONS_PER_USER; i++) {
      connections.push(createConnection(userId));
    }
  });

  // Periodically force some connections to reconnect
  setInterval(() => {
    const numToReconnect = Math.floor(connections.length * 0.2);
    const connectionsToReconnect = connections
      .sort(() => Math.random() - 0.5)
      .slice(0, numToReconnect);

    connectionsToReconnect.forEach((conn) => {
      console.log(`Force reconnecting a connection for user ${conn.userId}`);
      conn.ws.close();
    });
  }, RECONNECT_INTERVAL);

  // Main message generation loop
  while (true) {
    try {
      const roomAndRound = await getActiveRoomAndRound();

      // Handle subscriptions for all connections
      for (const connection of connections) {
        if (!connection.ws || connection.ws.readyState !== WebSocket.OPEN) continue;

        if (!roomAndRound) {
          if (connection.isSubscribed && connection.currentRoom) {
            const content = {
              roomId: connection.currentRoom.roomId,
            };
            const signature = await connection.wallet.signMessage(JSON.stringify(content));

            connection.ws.send(
              JSON.stringify({
                messageType: WsMessageTypes.SUBSCRIBE_ROOM,
                sender: connection.wallet.address,
                signature,
                content,
              })
            );
            connection.isSubscribed = false;
            connection.currentRoom = null;
          }
          continue;
        }

        // Subscribe if needed
        if (!connection.isSubscribed || connection.currentRoom?.roomId !== roomAndRound.roomId) {
          if (connection.currentRoom) {
            const content = {
              roomId: connection.currentRoom.roomId,
            };
            const signature = await connection.wallet.signMessage(JSON.stringify(content));

            connection.ws.send(
              JSON.stringify({
                messageType: WsMessageTypes.SUBSCRIBE_ROOM,
                sender: connection.wallet.address,
                signature,
                content,
              })
            );
          }

          const content = {
            roomId: roomAndRound.roomId,
          };
          const signature = await connection.wallet.signMessage(JSON.stringify(content));

          connection.ws.send(
            JSON.stringify({
              messageType: WsMessageTypes.SUBSCRIBE_ROOM,
              sender: connection.wallet.address,
              signature,
              content,
            })
          );

          connection.isSubscribed = true;
          connection.currentRoom = roomAndRound;
          console.log(
            `Connection for user ${connection.userId} subscribed to room ${roomAndRound.roomId}`
          );
        }
      }

      // Send messages from random connections
      if (roomAndRound && connections.length > 0) {
        const activeConnection = connections[Math.floor(Math.random() * connections.length)];
        if (activeConnection.ws.readyState === WebSocket.OPEN) {
          const rand = Math.random();
          let message;

          if (rand < BAD_MESSAGE_PROBABILITY) {
            message = generateBadMessage();
          } else if (rand < 0.25) {
            // Public chat message
            const content = {
              roomId: roomAndRound.roomId,
              roundId: roomAndRound.roundId,
              userId: activeConnection.userId,
              text: getRandomMessage(),
              timestamp: Date.now(),
            };
            const signature = await activeConnection.wallet.signMessage(JSON.stringify(content));

            message = {
              messageType: WsMessageTypes.PUBLIC_CHAT,
              sender: activeConnection.wallet.address,
              signature,
              content,
            } satisfies z.infer<typeof publicChatMessageInputSchema>;
          } else if (rand < 0.35) {
            // Participants request
            const content = {
              roomId: roomAndRound.roomId,
              timestamp: Date.now(),
            };

            message = {
              messageType: WsMessageTypes.PARTICIPANTS,
              content,
            } satisfies z.infer<typeof participantsInputMessageSchema>;
          } else if (rand < 0.45) {
            // GM message
            const content = {
              roomId: roomAndRound.roomId,
              roundId: roomAndRound.roundId,
              text: getRandomGMMessage(),
              timestamp: Date.now(),
              gmId: 51,
              targets: [],
              ignoreErrors: false,
              message: getRandomGMMessage(),
            };

            const signature = await backendEthersSigningWallet.signMessage(JSON.stringify(content));

            message = {
              messageType: WsMessageTypes.GM_MESSAGE,
              sender: backendEthersSigningWallet.address,
              signature,
              content,
            } satisfies z.infer<typeof gmMessageInputSchema>;
          } else if (rand < 0.7) {
            // Agent message via POST
            try {
              const content = {
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                text: getRandomAgentMessage(),
                timestamp: Date.now(),
                agentId: 51,
              };
              const signature = await activeConnection.wallet.signMessage(JSON.stringify(content));

              const message: z.infer<typeof agentMessageInputSchema> = {
                messageType: WsMessageTypes.AGENT_MESSAGE,
                sender: activeConnection.wallet.address,
                signature,
                content,
              };

              const response = await axios.post(`${API_BASE_URL}/messages/agentMessage`, message);

              console.log(`User ${activeConnection.userId} sent agent message via POST:`, {
                message,
                response: response.data,
              });
            } catch (error) {
              console.error('Error sending agent message via POST:', error);
            }
          }

          if (message) {
            activeConnection.ws.send(JSON.stringify(message));
            console.log(`User ${activeConnection.userId} sent message:`, message);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, randomDelay()));
    } catch (error) {
      console.error('Error in message generation loop:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// Start the generator
generateMessages().catch(console.error);
