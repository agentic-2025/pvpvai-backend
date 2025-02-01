import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Define the prompt for the wallet balance action
const GET_WALLET_BALANCE_PROMPT = `
This tool loads a an agent's wallet from the wallets directory and retrieves its balance.
This tool is used when you want to fetch a wallet balance for a wallet that isn't your own
Provide the network (e.g., 'base-sepolia') and the agent wallet address to check.
If you do not see the token listed in the wallet, you can assume the agent has a balance of 0 for that wallet
`;

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
    address: z.string().describe('The wallet address to check'),
  })
  .describe('Parameters for getting wallet balance');

/**
 * Gets the balance of a wallet from saved wallet files
 */
async function getAgentWalletBalance(args: z.infer<typeof GetWalletBalanceInput>): Promise<string> {
  try {
    // Construct path to wallet file
    const walletPath = path.join('./wallets', args.network, `${args.address}`);

    // Check if wallet file exists
    if (!fs.existsSync(walletPath)) {
      throw new Error(`No wallet file found at ${walletPath}`);
    }

    // Read and parse wallet file
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));

    console.log('walletData', walletData);
    // Import the wallet
    const wallet = await Wallet.import(walletData);

    // Get all balances
    const balances = await wallet.listBalances();

    return JSON.stringify(
      {
        message: 'Wallet balances retrieved successfully',
        network: args.network,
        address: args.address,
        balances: balances.toString(),
      },
      null,
      2
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
    throw new Error('Failed to get wallet balance: Unknown error');
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
