import { createClient } from '@supabase/supabase-js';
import axios, { AxiosError } from 'axios';
import { ethers, Wallet } from 'ethers';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { backendEthersSigningWallet } from './config';
import { roomAbi } from './types/contract.types';
import { Database } from './types/database.types';
import { WsMessageTypes } from './types/ws';
import {
  agentMessageInputSchema,
  gmMessageInputSchema,
  observationMessageInputSchema,
  ObservationType,
  participantsInputMessageSchema,
  publicChatMessageInputSchema,
  subscribeRoomInputMessageSchema,
} from './utils/schemas';
import { signPayload } from './utils/signer';
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
const PVP_ACTION_PROBABILITY = 0.05; // 5% chance of PVP action when message is generated

// Message type configuration flags - can be modified inline
const MESSAGE_TYPE_CONFIG = {
  PUBLIC_CHAT: true,
  PARTICIPANTS: false,
  GM_MESSAGES: false,
  AGENT_MESSAGES: true,
  OBSERVATIONS: false,
  BAD_MESSAGES: false, // Keeping this false by default for safety
} as const;

// Probability weights for enabled message types (will be normalized based on enabled types)
const BASE_PROBABILITIES = {
  PUBLIC_CHAT: 0.2,
  PARTICIPANTS: 0.03,
  GM_MESSAGES: 0.1,
  AGENT_MESSAGES: 0.3,
  OBSERVATIONS: 0.1,
} as const;

const randomDelay = () => Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;

const keyMap: Record<string, number> = {
  '0x4E5dC9dF946500b07E9c66e4DD29bf9CD062002B': 37,
  '0x67bFd0B42F5f39710B4E90301289F81Eab6315dA': 38,
  '0x12BE474D127757d0a6a36631294F8FfBCdeF44F8': 39,
};

// Private keys corresponding to the addresses above
const keyPool = [
  '0xffecbb174b4aceaa69cccbec90b87dce36ce19abb9a56fe2cc9c3becbec2b847', // for 0x4E5dC9dF946500b07E9c66e4DD29bf9CD062002B
  '0x0b0041a57eac50c87be1b1e25a41f698add5b5b3142b4795d72bd1c4b1d1f2de', // for 0x67bFd0B42F5f39710B4E90301289F81Eab6315dA
  '0xa982f591f9334e05b20ee56bf442253f51e527ede300b2cad1731b38e3a017aa', // for 0x12BE474D127757d0a6a36631294F8FfBCdeF44F8
];

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
    .eq('room_id', 15)
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
    .map(([key]) => key as keyof typeof BASE_PROBABILITIES);

  if (enabledTypes.length === 0) {
    console.warn('No message types enabled! Please enable at least one message type.');
    return {};
  }

  const totalWeight = enabledTypes.reduce((sum, type) => sum + BASE_PROBABILITIES[type], 0);

  const normalized = {} as Record<string, number>;
  let accumulator = 0;

  enabledTypes.forEach((type) => {
    normalized[type] = accumulator + BASE_PROBABILITIES[type] / totalWeight;
    accumulator = normalized[type];
  });

  console.log('Enabled message types with normalized probabilities:', normalized);
  return normalized;
}

// Helper function to enable/disable message types
function setMessageTypes(types: Partial<typeof MESSAGE_TYPE_CONFIG>) {
  Object.assign(MESSAGE_TYPE_CONFIG, types);
  const probabilities = calculateProbabilities();
  console.log('Updated message types:', MESSAGE_TYPE_CONFIG);
  console.log('New probabilities:', probabilities);
}

// Helper function to update probabilities
function setProbabilities(probs: Partial<typeof BASE_PROBABILITIES>) {
  Object.assign(BASE_PROBABILITIES, probs);
  const probabilities = calculateProbabilities();
  console.log('Updated base probabilities:', BASE_PROBABILITIES);
  console.log('New normalized probabilities:', probabilities);
}

// Example usage:
// To disable agent messages and observations:
// setMessageTypes({ AGENT_MESSAGES: false, OBSERVATIONS: false });

// To change probabilities:
// setProbabilities({ PUBLIC_CHAT: 0.5, GM_MESSAGES: 0.5 });

function stringToHex(str: string): string {
  return ethers.hexlify(ethers.toUtf8Bytes(str));
}

async function invokePvpAction(wallet: ethers.Wallet, targetAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const contract = new ethers.Contract(
    '0x9Bd805b04809AeE006Eb05572AAFB2807A03eCDb',
    roomAbi,
    wallet.connect(provider)
  );

  // Always use attack for demo
  const verb = 'attack';

  // Match the attack action schema parameters
  const parameters = {
    target: targetAddress,
    message: 'This is a test attack',
  };

  try {
    const tx = await contract.invokePvpAction(
      targetAddress,
      verb,
      stringToHex(JSON.stringify(parameters))
    );
    console.log(`Invoked PVP action ${verb}:`, tx.hash);
    await tx.wait();
  } catch (error) {
    console.error('Error invoking PVP action:', error);
  }
}

// At the top of the file, define our agent keys and their mappings

const AGENT_KEYS = {
  AGENT_37: {
    privateKey: '0xffecbb174b4aceaa69cccbec90b87dce36ce19abb9a56fe2cc9c3becbec2b847',
    address: '0x4E5dC9dF946500b07E9c66e4DD29bf9CD062002B',
    id: 37,
  },
  AGENT_38: {
    privateKey: '0x0b0041a57eac50c87be1b1e25a41f698add5b5b3142b4795d72bd1c4b1d1f2de',
    address: '0x67bFd0B42F5f39710B4E90301289F81Eab6315dA',
    id: 38,
  },
  AGENT_39: {
    privateKey: '0xa982f591f9334e05b20ee56bf442253f51e527ede300b2cad1731b38e3a017aa',
    address: '0x12BE474D127757d0a6a36631294F8FfBCdeF44F8',
    id: 39,
  },
} as const;

// Keep track of which agent was used last
let lastAgentIndex = 0;

// Function to get the next agent in rotation
function getNextAgent() {
  const agents = Object.values(AGENT_KEYS);
  const agent = agents[lastAgentIndex];
  lastAgentIndex = (lastAgentIndex + 1) % agents.length;
  return {
    wallet: new Wallet(agent.privateKey),
    agentId: agent.id,
  };
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

    // Use any wallet for the connection - we'll select specific agents when sending messages
    const wallet = new Wallet(keyPool[Math.floor(Math.random() * keyPool.length)]);
    console.log(`Created connection for user ${userId} with wallet ${wallet.address}`);

    const connection: Connection = {
      ws,
      userId,
      wallet,
      isSubscribed: false,
      currentRoom: null,
    };

    ws.on('open', () => {
      console.log(`Connection established for user ${userId}`);
      connection.isSubscribed = false;
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      // console.log(`User ${userId} received message:`, message);
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
      // Create a new connection after a delay
      setTimeout(() => {
        const newConnection = createConnection(userId);
        connections.push(newConnection);
      }, RECONNECT_INTERVAL);
    });

    return connection;
  }

  // Initialize connections
  for (const user of testUsers) {
    for (let i = 0; i < CONNECTIONS_PER_USER; i++) {
      connections.push(createConnection(user.id));
    }
  }

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
        console.log('activeConnection', activeConnection.wallet.address);
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
            const signature = await signPayload(activeConnection.wallet, content);

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

            const signature = await signPayload(backendEthersSigningWallet, content);

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
              // Convert wallet address to lowercase before lookup
              let agentId = keyMap[activeConnection.wallet.address.toLowerCase()];
              // If no mapping exists, use a fallback random agent id from [37, 38, 39]
              if (agentId === undefined) {
                const fallbackAgentIds = [37, 38, 39];
                agentId = fallbackAgentIds[Math.floor(Math.random() * fallbackAgentIds.length)];
                console.log(
                  `No mapping for wallet ${activeConnection.wallet.address}. Using fallback agentId ${agentId}`
                );
              }

              const content = {
                timestamp: Date.now(),
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                agentId,
                text: getRandomAgentMessage(),
              };

              console.log('Sending agent message with content:', content);
              const signature = await signPayload(activeConnection.wallet, content);

              console.log('activeConnection.wallet.address', activeConnection.wallet.address);
              const message: z.infer<typeof agentMessageInputSchema> = {
                messageType: WsMessageTypes.AGENT_MESSAGE,
                sender: agentWallet.address,
                signature,
                content: sortObjectKeys(content),
              };

              const response = await axios.post(`${API_BASE_URL}/messages/agentMessage`, message);
              console.log(`Agent ${agentId} sent message successfully:`, {
                message,
                response: response.data,
              });
            } catch (error) {
              if (error instanceof AxiosError) {
                console.error('Error sending agent message via POST:', {
                  status: error.response?.status,
                  data: error.response?.data,
                  wallet: activeConnection.wallet.address,
                });
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
                agentId:
                  keyMap[activeConnection.wallet.address.toLowerCase()] ??
                  [37, 38, 39][Math.floor(Math.random() * 3)],
                timestamp: Date.now(),
                roomId: roomAndRound.roomId,
                roundId: roomAndRound.roundId,
                agentId: keyMap[activeConnection.wallet.address] || 57,
                observationType,
                data: getRandomObservation(observationType),
              };

              console.log('Sending observation message with content:', content);

              const signature = await signPayload(activeConnection.wallet, content);

              const observationMessage = observationMessageInputSchema.parse({
                messageType: 'observation',
                sender: activeConnection.wallet.address,
                signature: await signMessage(validatedData),
                content: validatedData,
              });

              console.log('Sending observation message with content:', observationMessage);

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
          } else if (rand < PVP_ACTION_PROBABILITY) {
            // Get a random target from the connections that isn't the sender
            const possibleTargets = connections.filter(
              (c) => c.wallet.address !== activeConnection.wallet.address
            );

            if (possibleTargets.length > 0) {
              const targetConnection =
                possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

              await invokePvpAction(activeConnection.wallet, targetConnection.wallet.address);
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
