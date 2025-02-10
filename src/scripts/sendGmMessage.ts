import axios from 'axios';
import { Wallet } from 'ethers';
import { z } from 'zod';
import { WsMessageTypes } from '../schemas/wsServer';
import { gmMessageInputSchema } from '../utils/schemas';
import { sortObjectKeys } from '../utils/sortObjectKeys';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function sendGmMessage() {
  // Create backend signing wallet - replace with your private key
  if (!process.env.SIGNER_PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is not set');
  }
  const backendEthersSigningWallet = new Wallet(process.env.SIGNER_PRIVATE_KEY);

  // Prepare message content
  const content = {
    roomId: 5, // Replace with your room ID
    roundId: 1, // Replace with your round ID
    timestamp: Date.now(),
    gmId: 51,
    targets: [], // Add agent IDs here, e.g. [12, 24, 25]
    ignoreErrors: false,
    message: 'Make a decision now',
  };

  console.log('Signing GM message:', content);
  // Sign the content
  const signature = await backendEthersSigningWallet.signMessage(
    JSON.stringify(sortObjectKeys(content))
  );

  console.log('Signed GM message:', signature);

  // Prepare the full message
  const message: z.infer<typeof gmMessageInputSchema> = {
    messageType: WsMessageTypes.GM_MESSAGE,
    sender: backendEthersSigningWallet.address,
    signature,
    content: sortObjectKeys(content),
  };

  try {
    console.log('Sending GM message:', message);
    const response = await axios.post(`${API_BASE_URL}/messages/gmMessage`, message);
    console.log('GM message sent successfully:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error sending GM message:', error.response?.data);
    } else {
      console.error('Error sending GM message:', error);
    }
  }
}

// Run the function
sendGmMessage().catch(console.error);
