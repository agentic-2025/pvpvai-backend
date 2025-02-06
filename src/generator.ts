import { createClient } from '@supabase/supabase-js';
import axios, { AxiosError } from 'axios';
import { Wallet } from 'ethers';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { backendEthersSigningWallet, SIGNATURE_WINDOW_MS } from './config';
import { Database } from './types/database.types';
import { WsMessageTypes } from './types/ws';
import { verifySignedMessage } from './utils/auth';
import {
  agentMessageInputSchema,
  gmMessageInputSchema,
  observationMessageInputSchema,
  ObservationType,
  participantsInputMessageSchema,
  publicChatMessageInputSchema,
  subscribeRoomInputMessageSchema,
} from './utils/schemas';
import { sortObjectKeys } from './utils/sortObjectKeys';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:3000/ws';
const MIN_DELAY = 500;
const MAX_DELAY = 2000;
const NUM_TEST_USERS = 3;
const CONNECTIONS_PER_USER = 5;
const RECONNECT_INTERVAL = 10000;
const BAD_MESSAGE_PROBABILITY = 0.005;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Message type configuration flags
const MESSAGE_TYPE_CONFIG = {
  PUBLIC_CHAT: true,
  PARTICIPANTS: true, 
  GM_MESSAGES: true,
  AGENT_MESSAGES: true,
  OBSERVATIONS: true,
  BAD_MESSAGES: false, // Keeping this false by default for safety
} as const;

// Probability weights for enabled message types (will be normalized based on enabled types)
const BASE_PROBABILITIES = {
  PUBLIC_CHAT: 0.35,
  PARTICIPANTS: 0.20,
  GM_MESSAGES: 0.225,
  AGENT_MESSAGES: 0.125,
  OBSERVATIONS: 0.10,
} as const;

const randomDelay = () => Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;

const keyMap: Record<string, number> = {
  '0x9cf1FE84d1Bc056A171fd75Fe9C9789da35B1ffd': 12,
  '0xAd6226d73C53a0F37A4F551fCc1c1F3B17dB24CA': 11,
  '0xC333a28917644C2A75bB3A5B42D1dBB11f244E3c': 10,
  '0xEcd63D57e0e03EeC21CC76B6F374F611260CC81D': 24,
  '0x0C33268cBaFB2520CC01f11B2D41a5069ec20EcA': 25,
};
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

// Add sample observation data
const sampleObservations = {
  [ObservationType.WALLET_BALANCES]: [
    {
      address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      balances: {
        ETH: '1.5',
        USDC: '1000.00',
        WETH: '0.5',
      },
    },
  ],
  [ObservationType.PRICE_DATA]: [
    {
      pair: 'ETH/USD',
      price: '2150.75',
      timestamp: Date.now(),
    },
    {
      pair: 'BTC/USD',
      price: '35750.25',
      timestamp: Date.now(),
    },
  ],
  [ObservationType.GAME_EVENT]: [
    {
      type: 'round_start',
      details: 'New trading round beginning',
    },
    {
      type: 'market_update',
      details: 'Significant price movement detected',
    },
  ],
};

const getRandomObservation = (type: ObservationType) => {
  const observations = sampleObservations[type];
  return observations[Math.floor(Math.random() * observations.length)];
};

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
    .eq('room_id', 5)
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

// Helper function to calculate normalized probabilities based on enabled types
function calculateProbabilities() {
  const enabledTypes = Object.entries(MESSAGE_TYPE_CONFIG)
    .filter(([key, enabled]) => enabled && key in BASE_PROBABILITIES)
    .map(([key]) => key);

  if (enabledTypes.length === 0) {
    console.warn('No message types enabled! Defaulting to PUBLIC_CHAT only.');
    return { PUBLIC_CHAT: 1 };
  }

  const totalWeight = enabledTypes.reduce(
    (sum, type) => sum + (BASE_PROBABILITIES[type as keyof typeof BASE_PROBABILITIES] || 0),
    0
  );

  const normalized = {} as Record<string, number>;
  let accumulator = 0;

  enabledTypes.forEach(type => {
    const baseProb = BASE_PROBABILITIES[type as keyof typeof BASE_PROBABILITIES] || 0;
    normalized[type] = accumulator + (baseProb / totalWeight);
    accumulator = normalized[type];
  });

  return normalized;
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

    const keyPool = [
      '0x32cba915afa59d3f6081f64cfce0bed81c15f38300a4d805ecf80caa4309de88', // 0x9cf1FE84d1Bc056A171fd75Fe9C9789da35B1ffd
      '0x4aa8fe4cc299ee31964deaf6a67eef596866969825a49104e92ed191aad4ab6b', // 0xAd6226d73C53a0F37A4F551fCc1c1F3B17dB24CA
      '0x2b202ea4d3b7a57276bdf9574c0eb46c2de17fa3fe6d64b13a18a79847523a96', // 0xC333a28917644C2A75bB3A5B42D1dBB11f244E3c
      '0x5b82c3f345916d77814b169d26e515a9ac215ab11ec7aa2ee70459f0fa9d8611', // 0xEcd63D57e0e03EeC21CC76B6F374F611260CC81D
      '0x342cfd6037271050d8783cc504077c4b1e11454da8211bfb29ac0a05c9508e9d', // 0x0C33268cBaFB2520CC01f11B2D41a5069ec20EcA
      '0x59964d0d2e42d68210d2195a529280e55ac587027fae781adcfeaf6785aec4c2', // 0x4252C0fBaB671488b3c3fC2c76D40E1BD844D1e5
      '0xe31f34fe0eb308d05725219337ac69d1827f729e5ff36d161323a3cc9e42aeb3', // 0xf4cfbCAdB08c618bb98Fbf82090f20897473e15E
      '0xb966644b20cfabbb7dfb5aee78e75d587eac777d63eb61516c4f56995022fe33', // 0x217978E892E62E19216129694fa439C9FA3CcAB8
      '0xc37ec93ae0ac18806ad9d86d1b3e83324b790d67e90ec3139a56b20405472e45', // 0x5837B85d7966DEa3025f500b50dBc9BF89058005
      '0xb92bd0c7c141fc381efbf5381ec12f674302b3ab29382fec2a6998e073fd1b88', // 0x1D5EbEABEE35dbBA6Fd2847401F979b3f6249a93
      '0x922a64dac895e4ebedd2e942060f73e85b0bda1ef7cc852c5e194629f437320a', // 0xe35dEc6912117c165f089F1fCD3f15601B96b3Dd
      '0x3569d1263cf81e7f06dec377a41ed2bd509fe882fc170215563e347d6db752ba', // 0xc727C64CaeB98A915C4389931086156F60b6db25
    ];
    const wallet = new Wallet(keyPool[Math.floor(Math.random() * keyPool.length)]);
    console.log(`Created wallet with this private key: ${wallet.privateKey}`);

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
                content: sortObjectKeys(content),
              } satisfies z.infer<typeof subscribeRoomInputMessageSchema>)
            );
          }

          const content = {
            roomId: roomAndRound.roomId,
          };
          const signature = await connection.wallet.signMessage(JSON.stringify(content));

          connection.ws.send(
            JSON.stringify({
              messageType: WsMessageTypes.SUBSCRIBE_ROOM,
              content: sortObjectKeys(content),
            } satisfies z.infer<typeof subscribeRoomInputMessageSchema>)
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

          const probabilities = calculateProbabilities();

          if (MESSAGE_TYPE_CONFIG.BAD_MESSAGES && rand < BAD_MESSAGE_PROBABILITY) {
            message = generateBadMessage();
          } else if (MESSAGE_TYPE_CONFIG.PUBLIC_CHAT && rand < probabilities.PUBLIC_CHAT) {
            console.log('Sending public chat message');
            // 35% for public chat
            // Public chat message
            const content = {
              roomId: roomAndRound.roomId,
              roundId: roomAndRound.roundId,
              userId: activeConnection.userId,
              text: getRandomMessage(),
              timestamp: Date.now(),
            };
            const signature = await activeConnection.wallet.signMessage(
              JSON.stringify(sortObjectKeys(content))
            );

            message = {
              messageType: WsMessageTypes.PUBLIC_CHAT,
              sender: activeConnection.wallet.address,
              signature,
              content,
            } satisfies z.infer<typeof publicChatMessageInputSchema>;
          } else if (MESSAGE_TYPE_CONFIG.PARTICIPANTS && rand < probabilities.PARTICIPANTS) {
            // 20% for participants
            // Participants request
            const content = {
              roomId: roomAndRound.roomId,
              timestamp: Date.now(),
            };

            message = {
              messageType: WsMessageTypes.PARTICIPANTS,
              content: sortObjectKeys(content),
            } satisfies z.infer<typeof participantsInputMessageSchema>;
          } else if (MESSAGE_TYPE_CONFIG.GM_MESSAGES && rand < probabilities.GM_MESSAGES) {
            // 22.5% for GM messages
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

            const signature = await backendEthersSigningWallet.signMessage(
              JSON.stringify(sortObjectKeys(content))
            );

            message = {
              messageType: WsMessageTypes.GM_MESSAGE,
              sender: backendEthersSigningWallet.address,
              signature,
              content: sortObjectKeys(content),
            } satisfies z.infer<typeof gmMessageInputSchema>;
          } else if (MESSAGE_TYPE_CONFIG.AGENT_MESSAGES && rand < probabilities.AGENT_MESSAGES) {
            // 12.5% for agent messages
            // Agent message via POST
            try {
              const content = {
                timestamp: Date.now(),
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                agentId: keyMap[activeConnection.wallet.address],
                text: getRandomAgentMessage(),
              };
              console.log('signingWallet', activeConnection.wallet.address);
              const signature = await activeConnection.wallet.signMessage(
                JSON.stringify(sortObjectKeys(content))
              );

              console.log('signature', signature);
              const { signer, error: signatureError } = verifySignedMessage(
                sortObjectKeys(content),
                signature,
                activeConnection.wallet.address,
                content.timestamp,
                SIGNATURE_WINDOW_MS
              );
              console.log('signature signers', signer, signatureError);
              const message: z.infer<typeof agentMessageInputSchema> = {
                messageType: WsMessageTypes.AGENT_MESSAGE,
                sender: activeConnection.wallet.address,
                signature,
                content: sortObjectKeys(content),
              } satisfies z.infer<typeof agentMessageInputSchema>;
              console.log('message', message);

              const response = await axios.post(`${API_BASE_URL}/messages/agentMessage`, message);

              console.log(`User ${activeConnection.userId} sent agent message via POST:`, {
                message,
                response: response.data,
              });
            } catch (error) {
              if (error instanceof AxiosError) {
                console.error('Error sending agent message via POST:', error.response?.data);
              } else {
                console.error('Error sending agent message via POST:', error);
              }
            }
          } else if (MESSAGE_TYPE_CONFIG.OBSERVATIONS && rand <= probabilities.OBSERVATIONS) {
            // 10% for observations
            try {
              const observationType =
                Object.values(ObservationType)[
                  Math.floor(Math.random() * Object.values(ObservationType).length)
                ];

              const content = {
                agentId: keyMap[activeConnection.wallet.address],
                timestamp: Date.now(),
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                observationType,
                data: getRandomObservation(observationType),
              };

              const signature = await activeConnection.wallet.signMessage(JSON.stringify(content));

              const observationMessage: z.infer<typeof observationMessageInputSchema> = {
                messageType: 'observation',
                sender: activeConnection.wallet.address,
                signature,
                content: sortObjectKeys(content) satisfies z.infer<typeof observationMessageInputSchema>,
              };

              try {
                const response = await axios.post(
                  `${API_BASE_URL}/messages/observations`,
                  observationMessage
                );

                console.log(`User ${activeConnection.userId} sent observation via POST:`, {
                  message: observationMessage,
                  response: response.data,
                });
              } catch (error) {
                if (error instanceof AxiosError) {
                  console.error('Error sending observation via POST:', error.response?.data);
                } else {
                  console.error('Error sending observation via POST:', error);
                }
              }
            } catch (error) {
              console.error('Error generating observation message:', error);
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
