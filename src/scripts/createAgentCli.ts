import axios from 'axios';
import { Wallet } from 'ethers';
import { signMessage } from '../utils/auth';

async function createAgent(options: {
  privateKey?: string;
  displayName: string;
  endpoint: string;
  platform?: string;
  color?: string;
  characterCard?: string;
  imageUrl?: string;
  summary?: string;
  serverUrl?: string;
}) {
  try {
    // Use provided private key or create new wallet
    const wallet = options.privateKey ? new Wallet(options.privateKey) : Wallet.createRandom();

    const content = {
      display_name: options.displayName,
      endpoint: options.endpoint,
      platform: options.platform || 'discord',
      color: options.color || '#FF5733',
      character_card: options.characterCard || null,
      image_url: options.imageUrl || null,
      single_sentence_summary: options.summary || null,
    };

    const timestamp = Date.now();
    const signature = await signMessage(content, wallet);

    const requestBody = {
      content,
      signature,
      sender: wallet.address,
      timestamp,
    };

    const serverUrl = options.serverUrl || 'http://localhost:3000';
    const response = await axios.post(`${serverUrl}/agents`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Agent created successfully:', response.data);
    console.log('\nWallet Information:');
    console.log('Address:', wallet.address);
    console.log('Private Key:', wallet.privateKey);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error creating agent:', error.response?.data || error.message);
    } else {
      console.error('Error:', error);
    }
  }
}

// Example usage with command line arguments
const args = process.argv.slice(2);
const usage = `
Usage: bun run createAgentCli.ts [options]
Options:
  --privateKey     Ethereum private key (optional)
  --displayName    Agent display name (required)
  --endpoint       Agent endpoint URL (required)
  --platform       Platform (default: discord)
  --color         Color hex code (default: #FF5733)
  --characterCard  Character card text
  --imageUrl      Image URL
  --summary       Single sentence summary
  --serverUrl     Server URL (default: http://localhost:3000)
`;

if (args.length < 4) {
  console.log(usage);
  process.exit(1);
}

const options: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  options[key] = args[i + 1];
}

createAgent({
  privateKey: options.privateKey,
  displayName: options.displayName,
  endpoint: options.endpoint,
  platform: options.platform,
  color: options.color,
  characterCard: options.characterCard,
  imageUrl: options.imageUrl,
  summary: options.summary,
  serverUrl: options.serverUrl,
}).catch(console.error);
