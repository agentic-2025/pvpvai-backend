import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { Database } from './types/database.types';
import {
  AIChatContent,
  GMMessageContent,
  PVPMessageContent,
  WSMessageInput,
  WSMessageOutput,
  WsMessageType,
} from './types/ws';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:3000/ws';
const MIN_DELAY = 1000;
const MAX_DELAY = 5000;
const NUM_TEST_USERS = 3;
const CONNECTIONS_PER_USER = 5; // Each user will have this many "tabs" open
const RECONNECT_INTERVAL = 10000; // Some connections will disconnect/reconnect every 30s
const BAD_MESSAGE_PROBABILITY = 0.005;

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

const getRandomMessage = () => sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

const getRandomGMAction = () => sampleGMActions[Math.floor(Math.random() * sampleGMActions.length)];

const getRandomPVPAction = () =>
  samplePVPActions[Math.floor(Math.random() * samplePVPActions.length)];

const getRandomAIMessage = () =>
  sampleAIMessages[Math.floor(Math.random() * sampleAIMessages.length)];

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

function generateBadMessage(): Partial<WSMessageInput> {
  const badMessages = [
    { type: 'invalid_type' as WsMessageType },
    { type: 'public_chat' as WsMessageType, content: {} },
    { type: 'public_chat' as WsMessageType, content: { roomId: 'not_a_number' } },
    { type: 'subscribe_room' as WsMessageType },
    {},
    null,
    undefined,
  ];
  return badMessages[Math.floor(Math.random() * badMessages.length)] as Partial<WSMessageInput>;
}

interface Connection {
  ws: WebSocket;
  userId: number;
  isSubscribed: boolean;
  currentRoom: { roomId: number; roundId: number } | null;
}

async function generateMessages() {
  const testUsers = await getTestUsers();
  if (!testUsers) {
    console.error('Failed to get test users, exiting...');
    return;
  }

  console.log(`Using test users:`, testUsers);

  // Create multiple connections per user
  const connections: Connection[] = [];

  function createConnection(userId: number): Connection {
    const ws = new WebSocket(WEBSOCKET_URL);
    const connection: Connection = {
      ws,
      userId,
      isSubscribed: false,
      currentRoom: null,
    };

    ws.on('open', () => {
      console.log(`Connection opened for user ${userId}`);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as WSMessageOutput;
      console.log(`User ${userId} received message:`, message);
      if (message.type === 'heartbeat') {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
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
    const numToReconnect = Math.floor(connections.length * 0.2); // Reconnect 20% of connections
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
            connection.ws.send(
              JSON.stringify({
                type: 'unsubscribe_room',
                author: connection.userId,
                timestamp: Date.now(),
                content: {
                  roomId: connection.currentRoom.roomId,
                },
              } as WSMessageInput)
            );
            connection.isSubscribed = false;
            connection.currentRoom = null;
          }
          continue;
        }

        // Subscribe if needed
        if (!connection.isSubscribed || connection.currentRoom?.roomId !== roomAndRound.roomId) {
          if (connection.currentRoom) {
            connection.ws.send(
              JSON.stringify({
                type: 'unsubscribe_room',
                author: connection.userId,
                timestamp: Date.now(),
                content: {
                  roomId: connection.currentRoom.roomId,
                },
              } as WSMessageInput)
            );
          }

          connection.ws.send(
            JSON.stringify({
              type: 'subscribe_room',
              author: connection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
              },
            } as WSMessageInput)
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
          let message: WSMessageInput;

          if (rand < BAD_MESSAGE_PROBABILITY) {
            message = generateBadMessage() as WSMessageInput;
          } else if (rand < 0.15) {
            // GM Action
            message = {
              type: WsMessageType.GM_ACTION,
              author: activeConnection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                gm_id: activeConnection.userId.toString(),
                content: {
                  text: getRandomGMAction(),
                },
                targets: [],
                timestamp: Date.now(),
              } satisfies GMMessageContent,
            };
          } else if (rand < 0.3) {
            // PVP Action
            const action = getRandomPVPAction();
            message = {
              type: WsMessageType.PVP_ACTION,
              author: activeConnection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                txHash: `0x${Math.random().toString(16).slice(2)}`,
                instigator: activeConnection.userId.toString(),
                actionType: action.type,
                targets: [],
                additionalData: {},
              } satisfies PVPMessageContent,
            };
          } else if (rand < 0.4) {
            // AI Chat
            message = {
              type: WsMessageType.AI_CHAT,
              author: activeConnection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                message_id: Date.now(),
                actor: `0x${Math.random().toString(16).slice(2)}`,
                sent: Date.now(),
                content: {
                  text: getRandomAIMessage(),
                },
                timestamp: Date.now(),
                altered: false,
              } satisfies AIChatContent,
            };
          } else if (rand < 0.5) {
            // Participants request
            message = {
              type: WsMessageType.PARTICIPANTS,
              author: activeConnection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
              },
            };
          } else {
            // Public Chat (default)
            message = {
              type: WsMessageType.PUBLIC_CHAT,
              author: activeConnection.userId,
              timestamp: Date.now(),
              content: {
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                text: getRandomMessage(),
              },
            };
          }

          activeConnection.ws.send(JSON.stringify(message));
          console.log(`User ${activeConnection.userId} sent message:`, message);
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
