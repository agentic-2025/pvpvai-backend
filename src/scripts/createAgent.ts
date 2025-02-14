import axios from 'axios';
import { z } from 'zod';
import { backendEthersSigningWallet } from '../config';
import { signedAgentCreationSchema } from '../routes/agentRoutes';
import { WsMessageTypes } from '../schemas/wsServer';
import { sortObjectKeys } from '../utils/auth';

async function createAgent() {
  try {
    // Create a test wallet - in production this would be your actual wallet

    // The agent data to be signed
    const content = {
      timestamp: Date.now(),
      display_name: 'Test Agent',
      endpoint: 'https://api.example.com/agent',
      platform: 'discord',
      color: '#FF5733',
      character_card: 'A friendly test agent',
      image_url: 'https://example.com/agent.png',
      single_sentence_summary: 'I am a test agent',
    };

    // Current timestamp
    const timestamp = Date.now();

    // Sign the content
    const signature = await backendEthersSigningWallet.signMessage(
      JSON.stringify(sortObjectKeys(content))
    );

    // Prepare the full request
    //  body
    const requestBody = {
      messageType: WsMessageTypes.CREATE_AGENT,
      content,
      signature,
      sender: backendEthersSigningWallet.address,
    } as z.infer<typeof signedAgentCreationSchema>;

    // Make the POST request
    const response = await axios.post('http://localhost:3000/agents', requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Agent created successfully:', response.data);

    // Log important information
    console.log('\nImportant Information:');
    console.log('Wallet Address:', backendEthersSigningWallet.address);
    console.log('Private Key:', backendEthersSigningWallet.privateKey);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error creating agent:', error.response?.data || error.message);
    } else {
      console.error('Error:', error);
    }
  }
}

// Run the script
createAgent().catch(console.error);
