import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';
// import getCurrentTimeTool from './tools/getCurrentTime';
import {
  getLatestRoundDataFromSupabase,
  getRoundDataProvider,
  RoundData,
} from './tools/getRoundDataFromSupabase';
// import webhookTool from './tools/webhook';

import {
  AgentKit,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  CdpWalletProvider,
  erc20ActionProvider,
  pythActionProvider,
  walletActionProvider,
  wethActionProvider,
} from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { getAgentWalletBalanceProvider } from './tools/getAgentWalletBalance';
import { getLatestObservationProvider } from './tools/getLatestObservation';
import { postObservationProvider } from './tools/postObservation';
import { signMessageProvider } from './tools/signMessage';

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

const priceFetchInstructions = `
  Below you will need to find the price data for tokens. When you are asked to fetch the price data for a token, you should do the following:
  <price_fetch_instructions>
    1. See if you already have the price data in a step that happened some time in the last 10 seconds. 
      - If you do have price data in USD for the token in a memory that is less than 10 seconds old, use that price data, otherwise continue. Do not use price data from memory that is more than 10 seconds old.
    2. If you do not have the price data in memory, or if the price data in memory is more than 10 seconds old, check if you have a Pyth feed id for the token/usd pair in memory. You can use memories that are up to 5m old for price feed ids. 
    3. If you do not have a feed id, then query Pyth for the feed id. If you are unable to find a feed id for the Token/USD pair on Pyth, then do not attempt to look up the price data on Pyth.
    4. If you have a Pyth feed id, then look up the price data on Pyth and store the price data in memory.
    5. If you were unable to find price data for the token/usd pair in any of the above steps, then use 0 for the price data for the token/usd pair.
    
    Do not attempt to fetch price data for NFTs. Do not call the get_price_data tool for NFTs.
  </price_fetch_instructions>
`;
/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
async function initializeAgent() {
  try {
    // Initialize LLM
    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
    });
    // const llm = new ChatAnthropic({
    //   model: 'claude-3-5-haiku-20241022',
    // });
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
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      cdpWalletData: walletDataStr || undefined,
      // mnemonicPhrase: process.env.MNEMONIC_PHRASE || "",
      networkId: process.env.NETWORK_ID || 'base-sepolia',
    };

    console.log('cdpWalletData', config);

    const walletProvider = await CdpWalletProvider.configureWithWallet(config);
    
    // Initialize CDP AgentKit
    // Initialize AgentKit
    const agentkit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider({
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        cdpWalletActionProvider({
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        getLatestObservationProvider,
        getRoundDataProvider,
        getAgentWalletBalanceProvider,
        postObservationProvider,
        signMessageProvider,
      ],
    });

    const tools = await getLangChainTools(agentkit);

    // Store buffered conversation history in memory
    const memory = new MemorySaver();
    const agentConfig = {
      agentkit,
      configurable: { thread_id: crypto.randomUUID() },
    };

    // Create React Agent using the LLM and CDP AgentKit tools
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit and other tools 
        written by the user. You are empowered to interact onchain using your tools. 
        If you ever need funds, you can request them from the faucet if you are on network ID 'base-sepolia'. If not, 
        you can provide your wallet details and request funds from the user. Before executing your first action, get 
        the wallet details to see what network you're on. If there is a 5XX (internal) HTTP error code, ask the user 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to 
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from 
        restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    // Save wallet data
    const exportedWallet = await walletProvider.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet, null, 2));

    return { agent, config: agentConfig };
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    throw error; // Re-throw to be handled by caller
  }
}

// - If you encounter an agent in the round that does not have a wallet address, create a wallet for them using the create_wallet tool and provide the agentId and roomId

async function processRound(round: RoundData, agent: any, config: any) {
  const fetchRoundPriceInstructions = `
    Goal: Fetch the current price of the native token for the chain and the price of the ERC20 token in the room associated with the round and publish the price data to the backend
     1. Look at the round_and_room_data and take note of which chain the room is on, what the native token is for that chain, and what the ERC20 token is for the current round for this room.
     2. Fetch the price data for the ERC20 token in the room associated with the round in USD and the chain's native token price in USD. 
     3. Prepare a JSON object with the following fields and post it as an observation to the backend:
          <price_data_json_object>
              {
                "account": "{{your wallet address}}",
                "observationType": "price-data",
                "content": {
                  "roomId": ${round.room_id},
                  "roundId": ${round.round_id},
                  "timestamp": {{current time}},  
                  "prices": {
                    "{{token_address}}": {
                      "address": "{{token_address}}",
                      "symbol": "{{token_symbol}}",
                      "source": "{{which tool you used to get the price data in lowercase}}",
                      "tokenPriceNative": {{token price in native, if needed this can be inferred from the token price in USD and the native price in USD}},
                      "tokenPriceUsd": {{token price in USD}},
                    }
                  },
                }
              }
          </price_data_json_object>  
      6. If you fail the previous step, then dump the tool call you made, the input you provided to the tool, and error message to the console.
  `;
  // 1. Look at the round_and_room_data and take note of which chain the room is on, which agents are in the round for the room and what their wallet addresses and wallet_json are. If they have no wallet_json and no wallet address, then exclude them from the observation.

  const fetchAgentWalletBalancesThought = `
      Goal: Gather the wallet balances for all agents in the round and publish the wallet balances to the backend
      1. Look at the round_and_room_data and take note of which chain the room is on, which agents are in the round for the room and what their wallet addresses and wallet_json are. If they have no wallet_json and no wallet address, then create a wallet for them.
      2. Fetch the wallet balance on the room's chain of all agents in the round. If the agent does not have a wallet_address and does not have a wallet_json, skip them. If you fail on a single wallet, skip them. If you fail on every wallet, however, abort. 
      3. Fetch the native token price in USD for the room's chain.
      4. Fetch the price data for all ERC20 tokens represented in all agents wallet balances. Do not attempt to fetch price data for NFTs, only fetch price data for ERC20 tokens.
      5. Prepare a JSON object with the following fields and pass it and the wallet to a post_observation tool call.  If you failed to fetch balance data for any agent, do not include them in the observation. If you do not have the data you need to fill in this JSON object, skip this step:
          <wallet_balances_json_object>
          {
            "observationType": "wallet-balances",
            "account": "{{your wallet address}}",
            "content": {
              "roomId": ${round.room_id},
              "roundId": ${round.round_id}, 
              "walletBalances": {
                {{agentId}}: {
                  "nativeBalance": {{agent's native balance}},
                  "tokenBalances": {
                    "{{token_address}}": {
                      "balance": {{agent's token balance}},
                      "valueUsd": {{value of agent's token balance in USD}},
                      "valueNative": {{value of agent's token balance in native, can be inferred from the token price in USD and the native price in USD}},
                    }
                  },
                },
              }
            }
          }
          </wallet_balances_json_object>
      6. If you fail the previous step, then dump the tool call you made, the input you provided to the tool, and error message to the console.
    `;

  const processRoundThought = (roundFunction: string) => `
  Process the following round and room data:
  <round_and_room_data>
    ${JSON.stringify(round, null, 2)}
  </round_and_room_data>

  ${priceFetchInstructions}

  Then, for this round do the following:
  ${roundFunction}
  `;

  const roundStream = await agent.stream(
    { messages: [new HumanMessage(processRoundThought(fetchAgentWalletBalancesThought))] },
    config
  );

  for await (const chunk of roundStream) {
    if ('agent' in chunk) {
      console.log(`Round ${round.round_id}:`, chunk.agent.messages[0].content);
    } else if ('tools' in chunk) {
      console.log(
        `Round ${round.round_id} tool (${chunk.tools.messages[0].name}):`,
        chunk.tools.messages[0].content
      );
    }
    console.log('-------------------');
  }

  const roundStream2 = await agent.stream(
    { messages: [new HumanMessage(processRoundThought(fetchRoundPriceInstructions))] },
    config
  );

  //TODO Code duplication is sloppy
  for await (const chunk of roundStream2) {
    if ('agent' in chunk) {
      console.log(`Round ${round.round_id}:`, chunk.agent.messages[0].content);
    } else if ('tools' in chunk) {
      console.log(
        `Round ${round.round_id} tool (${chunk.tools.messages[0].name}):`,
        chunk.tools.messages[0].content
      );
    }
    console.log('-------------------');
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

  const KILL_ME_AT = 10;
  let currentCount = 0;
  while (true) {
    try {
      const roundsData = await getLatestRoundDataFromSupabase();
      console.log('roundsData', JSON.stringify(roundsData, null, 2));
      if (!roundsData || !roundsData.length) {
        console.log('No active rounds found, nothing to do');
        continue;
      }

      // console.log('config', config);
      // console.log('Agent address:', agentAddress);

      // Process each round in parallel
      await Promise.all(roundsData.map((round) => processRound(round, agent, config)));

      await new Promise((resolve) => setTimeout(resolve, interval * 10000));
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
    currentCount++;
    if (currentCount >= KILL_ME_AT) {
      console.log(
        "HIT MAX ROUNDS FOR AUTO MODE, REMOVE KILL_ME_AT IF YOU DON'T WANT TO AUTO EXIST"
      );
      process.exit(0);
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
  // Check command line arguments first
  const args = process.argv.slice(2);
  if (args.includes('--chat')) {
    return 'chat';
  }
  if (args.includes('--auto')) {
    return 'auto';
  }

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
