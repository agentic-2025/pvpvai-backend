import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpToolkit } from '@coinbase/cdp-langchain';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';
import createWalletTool from './tools/createWallet';
import getAgentWalletBalanceTool from './tools/getAgentWalletBalance';
import getCurrentPriceTool from './tools/getCurrentTime';
import getLatestObservationTool from './tools/getLatestObservation';
import getRoundDataTool from './tools/getRoundDataFromSupabase';
import signMessageTool from './tools/signMessage';
// import webhookTool from './tools/webhook';
dotenv.config();

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
  const requiredVars = ['OPENAI_API_KEY', 'CDP_API_KEY_NAME', 'CDP_API_KEY_PRIVATE_KEY'];
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Exit if any required variables are missing
  if (missingVars.length > 0) {
    console.error('Error: Required environment variables are not set');
    missingVars.forEach((varName) => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  // Warn about optional NETWORK_ID
  if (!process.env.NETWORK_ID) {
    console.warn('Warning: NETWORK_ID not set, defaulting to base-sepolia testnet');
  }
}

// Add this right after imports and before any other code
validateEnvironment();

// Configure a file to persist the agent's CDP MPC Wallet Data
const WALLET_DATA_FILE = '../../wallet_data.txt';

/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
async function initializeAgent() {
  try {
    // Initialize LLM
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
    });
    let walletDataStr: string | null = null;

    // Read existing wallet data if available
    if (fs.existsSync(WALLET_DATA_FILE)) {
      try {
        walletDataStr = fs.readFileSync(WALLET_DATA_FILE, 'utf8');
      } catch (error) {
        console.error('Error reading wallet data:', error);
        // Continue without wallet data
      }
    }

    // Configure CDP AgentKit
    const config = {
      cdpWalletData: walletDataStr || undefined,
      networkId: process.env.NETWORK_ID || 'base-sepolia',
    };

    // Initialize CDP AgentKit
    const agentkit = await CdpAgentkit.configureWithWallet(config);

    // Initialize CDP AgentKit Toolkit and get tools
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = [
      ...cdpToolkit.getTools(),
      createWalletTool(agentkit),
      getRoundDataTool(agentkit),
      signMessageTool(agentkit),
      getAgentWalletBalanceTool(agentkit),
      getLatestObservationTool(agentkit),
      getCurrentPriceTool(agentkit),
      // webhookTool(agentkit),
    ];

    // Store buffered conversation history in memory
    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: 'CDP AgentKit Chatbot Example!' } };

    // Create React Agent using the LLM and CDP AgentKit tools
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are 
        empowered to interact onchain using your tools. If you ever need funds, you can request them from the 
        faucet if you are on network ID 'base-sepolia'. If not, you can provide your wallet details and request 
        funds from the user. Before executing your first action, get the wallet details to see what network 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to 
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from 
        restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    // Save wallet data
    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);

    return { agent, config: agentConfig };
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log('Starting autonomous mode...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // - Search the r/cryptocurrency subreddit for any mentions of the token
      // - Record the total change in price of the token since the round started
      const thought = `
      1. Fetch all currently active rounds for all Buy/Hold/Sell games with >30s left on the clock, and their associated room data from Supabase
      2. For each open round:
        - Take note of which chain the room is on, which agents are in the round for the room and what their wallet addresses are, and what token the agents are trading on in the room.
        - Fetch the latest observation data for the latest round of the room from Supabase
        - Use pyth to fetch the current price of the ERC20 token in the room associated with the round in USD and native.
        - Fetch the wallet balance of all agents in the round
        - Record the total value of each agent's wallet in USD and native.
        - Take note of the current timestamp
        - Prepare a JSON object with the following fields:
          <json>
          {
            "timestamp": {{current timestamp}},
            "walletBalances": {
            {{agentId}}: {
                "nativeBalance": {{nativeBalance}},
                "tokenBalance": {{room token balance}},
                "nativeValue": {{value of nativeBalance + tokenBalance in native}},
                "usdValue": {{value of nativeBalance + tokenBalance in USD}}
                "percentChangeNative": {{percent change in native value from the previous observation}}
                "percentChangeUsd": {{percent change in usd value from the previous observation}}
            },
            "tokenPriceUsd": {{token price in USD}},
            "nativePriceUsd": {{native price in USD}}
          }
          </json>
         - Create a signature of the JSON object using your own private key
         - Send a POST request to ${config.BACKEND_URL}/:roomId/round/:roundId with the following body and headers:
          <headers>
            Content-Type: application/json
            X-Authorization-Signature: {{signature of the JSON object}}
          </headers>
          <body>
             {{JSON Object you signed}}
          </body>

          If you are not able to get all the way through, explain all steps you took and where you stopped.
        `;

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

      for await (const chunk of stream) {
        if ('agent' in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ('tools' in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log('-------------------');
      }

      await new Promise((resolve) => setTimeout(resolve, interval * 10000));
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  }
}

/**
 * Run the agent interactively based on user input
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const userInput = await question('\nPrompt: ');

      if (userInput.toLowerCase() === 'exit') {
        break;
      }

      const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

      for await (const chunk of stream) {
        if ('agent' in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ('tools' in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log('-------------------');
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Choose whether to run in autonomous or chat mode based on user input
 *
 * @returns Selected mode
 */
async function chooseMode(): Promise<'chat' | 'auto'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log('\nAvailable modes:');
    console.log('1. chat    - Interactive chat mode');
    console.log('2. auto    - Autonomous action mode');

    const choice = (await question('\nChoose a mode (enter number or name): '))
      .toLowerCase()
      .trim();

    if (choice === '1' || choice === 'chat') {
      rl.close();
      return 'chat';
    } else if (choice === '2' || choice === 'auto') {
      rl.close();
      return 'auto';
    }
    console.log('Invalid choice. Please try again.');
  }
}

/**
 * Start the chatbot agent
 */
async function main() {
  try {
    const { agent, config } = await initializeAgent();
    const mode = await chooseMode();

    if (mode === 'chat') {
      await runChatMode(agent, config);
    } else {
      await runAutonomousMode(agent, config);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  console.log('Starting Agent...');
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
