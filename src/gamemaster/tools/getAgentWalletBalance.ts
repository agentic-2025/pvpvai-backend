import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Define the prompt for the wallet balance action
const GET_WALLET_BALANCE_PROMPT = `
This tool is used to retrieve the wallet balances for a given set of agents using the coinbase-sdk.
You should use this tool when you want to fetch wallet balances for one or more agents.
Provide the network (e.g., 'base-sepolia') and an array of wallet information. Each wallet info object should contain either a wallet_json or an address (or both).
Note that if you do not see the token listed in the wallet, you can assume that the token does exist on the network, but the agent has a balance of 0 for that wallet.
`;

// Define the wallet info schema
const WalletInfo = z.object({
  wallet_json: z.string().optional().describe('The coinbase agent wallet json content'),
  address: z.string().optional().describe('The wallet address to check'),
  agent_id: z.number().describe('The agent ID associated with this wallet'),
});

// Define the input schema using Zod
const GetWalletBalanceInput = z
  .object({
    network: z
      .enum([
        'base-mainnet',
        'base-sepolia',
        'ethereum-mainnet',
        'polygon-mainnet',
        'arbitrum-mainnet',
        'solana-devnet',
      ])
      .describe('The network of the wallet'),
    wallets: z.array(WalletInfo).describe('Array of wallet information to check balances for'),
  })
  .describe('Parameters for getting wallet balances');

/**
 * Gets the balance of multiple wallets from either wallet_json or saved wallet files
 */
async function getAgentWalletBalance(args: z.infer<typeof GetWalletBalanceInput>): Promise<string> {
  try {
    const results = await Promise.all(
      args.wallets.map(async (walletInfo) => {
        try {
          let walletData;

          if (walletInfo.wallet_json) {
            walletData = JSON.parse(walletInfo.wallet_json);
          } else if (walletInfo.address) {
            console.log(
              `No wallet json found for agent ${walletInfo.agent_id}, attempting to read from file`
            );

            // Construct path to wallet file
            const walletPath = path.join('./wallets', args.network, `${walletInfo.address}.json`);

            // Check if wallet file exists
            if (!fs.existsSync(walletPath)) {
              throw new Error(`No wallet file found at ${walletPath}`);
            }
            walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
          } else {
            throw new Error('Either wallet_json or address must be provided');
          }

          // Import the wallet
          const wallet = await Wallet.import(walletData);
          // Get all balances
          const balances = await wallet.listBalances();
          console.log('Wallet', wallet);
          console.log('Balances', balances);
          return {
            agent_id: walletInfo.agent_id,
            address: walletInfo.address || (await wallet.getDefaultAddress()).toString(),
            balances: balances.toString(),
            success: true,
          };
        } catch (error) {
          return {
            agent_id: walletInfo.agent_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false,
          };
        }
      })
    );

    return JSON.stringify(
      {
        message: 'Wallet balances retrieved',
        network: args.network,
        results,
      },
      null,
      2
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get wallet balances: ${error.message}`);
    }
    throw new Error('Failed to get wallet balances: Unknown error');
  }
}

const getAgentWalletBalanceTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'get_agent_wallet_balance',
      description: GET_WALLET_BALANCE_PROMPT,
      argsSchema: GetWalletBalanceInput,
      func: getAgentWalletBalance,
    },
    agentkit
  );
};

export default getAgentWalletBalanceTool;
