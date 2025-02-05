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
  participantsInputMessageSchema,
  publicChatMessageInputSchema,
} from './utils/schemas';

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

    // 0x9cf1FE84d1Bc056A171fd75Fe9C9789da35B1ffd
    // 0xAd6226d73C53a0F37A4F551fCc1c1F3B17dB24CA
    // 0xC333a28917644C2A75bB3A5B42D1dBB11f244E3c
    // 0xEcd63D57e0e03EeC21CC76B6F374F611260CC81D
    // 0x0C33268cBaFB2520CC01f11B2D41a5069ec20EcA
    const keyPool = [
      '0x32cba915afa59d3f6081f64cfce0bed81c15f38300a4d805ecf80caa4309de88',
      '0x4aa8fe4cc299ee31964deaf6a67eef596866969825a49104e92ed191aad4ab6b',
      '0x2b202ea4d3b7a57276bdf9574c0eb46c2de17fa3fe6d64b13a18a79847523a96',
      '0x5b82c3f345916d77814b169d26e515a9ac215ab11ec7aa2ee70459f0fa9d8611',
      '0x342cfd6037271050d8783cc504077c4b1e11454da8211bfb29ac0a05c9508e9d',
      // "0x59964d0d2e42d68210d2195a529280e55ac587027fae781adcfeaf6785aec4c2 and address: 0x4252C0fBaB671488b3c3fC2c76D40E1BD844D1e5
      // "0xe31f34fe0eb308d05725219337ac69d1827f729e5ff36d161323a3cc9e42aeb3 and address: 0xf4cfbCAdB08c618bb98Fbf82090f20897473e15E
      // "0xb966644b20cfabbb7dfb5aee78e75d587eac777d63eb61516c4f56995022fe33 and address: 0x217978E892E62E19216129694fa439C9FA3CcAB8
      // "0xc37ec93ae0ac18806ad9d86d1b3e83324b790d67e90ec3139a56b20405472e45 and address: 0x5837B85d7966DEa3025f500b50dBc9BF89058005
      // "0xb92bd0c7c141fc381efbf5381ec12f674302b3ab29382fec2a6998e073fd1b88 and address: 0x1D5EbEABEE35dbBA6Fd2847401F979b3f6249a93
      // "0x922a64dac895e4ebedd2e942060f73e85b0bda1ef7cc852c5e194629f437320a and address: 0xe35dEc6912117c165f089F1fCD3f15601B96b3Dd
      // "0x3569d1263cf81e7f06dec377a41ed2bd509fe882fc170215563e347d6db752ba and address: 0xc727C64CaeB98A915C4389931086156F60b6db25
      // "0xffecbb174b4aceaa69cccbec90b87dce36ce19abb9a56fe2cc9c3becbec2b847 and address: 0x4E5dC9dF946500b07E9c66e4DD29bf9CD062002B
      // "0x0b0041a57eac50c87be1b1e25a41f698add5b5b3142b4795d72bd1c4b1d1f2de and address: 0x67bFd0B42F5f39710B4E90301289F81Eab6315dA
      // "0xa982f591f9334e05b20ee56bf442253f51e527ede300b2cad1731b38e3a017aa and address: 0x12BE474D127757d0a6a36631294F8FfBCdeF44F8
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

          // if (rand < BAD_MESSAGE_PROBABILITY) {
          //   message = generateBadMessage();
          // } else
          if (rand < 0.35) {
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
            const signature = await activeConnection.wallet.signMessage(JSON.stringify(content));

            message = {
              messageType: WsMessageTypes.PUBLIC_CHAT,
              sender: activeConnection.wallet.address,
              signature,
              content,
            } satisfies z.infer<typeof publicChatMessageInputSchema>;
          } else if (rand < 0.55) {
            // 20% for participants
            // Participants request
            const content = {
              roomId: roomAndRound.roomId,
              timestamp: Date.now(),
            };

            message = {
              messageType: WsMessageTypes.PARTICIPANTS,
              content,
            } satisfies z.infer<typeof participantsInputMessageSchema>;
          } else if (rand < 0.775) {
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

            const signature = await backendEthersSigningWallet.signMessage(JSON.stringify(content));

            message = {
              messageType: WsMessageTypes.GM_MESSAGE,
              sender: backendEthersSigningWallet.address,
              signature,
              content,
            } satisfies z.infer<typeof gmMessageInputSchema>;
          } else {
            // 22.5% for agent messages
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
              const signature = await activeConnection.wallet.signMessage(JSON.stringify(content));

              console.log('signature', signature);
              const { signer, error: signatureError } = verifySignedMessage(
                content,
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
                content,
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
