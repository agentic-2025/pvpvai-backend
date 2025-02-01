import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';
import { z } from 'zod';

// Define the prompt for the wallet creation action
const CREATE_WALLET_PROMPT = `
This tool creates a new wallet on a specified network using the Coinbase SDK.
If no network is specified, it defaults to Base Sepolia testnet.
`;

// Define the input schema using Zod
const CreateWalletInput = z
  .object({
    networkId: z
      .enum([
        'base-mainnet',
        'base-sepolia',
        'ethereum-mainnet',
        'polygon-mainnet',
        'arbitrum-mainnet',
        'solana-devnet',
      ])
      .optional()
      .describe('The network ID for the wallet. Defaults to base-sepolia if not specified'),
  })
  .strip()
  .describe('Instructions for creating a new wallet');

/**
 * Creates a new wallet on the specified network
 *
 * @param args - The input arguments for the action
 * @returns Information about the created wallet
 */
async function createWallet(args: z.infer<typeof CreateWalletInput>): Promise<string> {
  try {
    // Map network ID to Coinbase.networks constant[]
    const networkMap: Record<string, string> = {
      'base-mainnet': Coinbase.networks.BaseMainnet,
      'base-sepolia': Coinbase.networks.BaseSepolia,
      'ethereum-mainnet': Coinbase.networks.EthereumMainnet,
      'polygon-mainnet': Coinbase.networks.PolygonMainnet,
      'arbitrum-mainnet': Coinbase.networks.ArbitrumMainnet,
      'solana-devnet': Coinbase.networks.SolanaDevnet,
    };

    const networkId = args.networkId ? networkMap[args.networkId] : Coinbase.networks.BaseSepolia;

    // Create the wallet
    const wallet = await Wallet.create({ networkId });

    // Get the default address
    const address = await wallet.getDefaultAddress();

    // Export wallet data for persistence
    const exportedData = wallet.export();
    // Create wallets/networkId directory if it doesn't exist
    const networkDir = `./wallets/${address.getNetworkId()}`;
    if (!fs.existsSync(networkDir)) {
      fs.mkdirSync(networkDir, { recursive: true });
    }
    const walletPath = `./wallets/${address.getNetworkId()}/${address.getId()}.json`;
    wallet.saveSeedToFile(walletPath);

    return JSON.stringify(
      {
        message: 'Wallet created successfully',
        network: args.networkId || 'base-sepolia',
        address: address.toString(),
        exportedData,
        savedTo: walletPath,
      },
      null,
      2
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
    throw new Error('Failed to create wallet: Unknown error');
  }
}

const createWalletTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'create_wallet',
      description: CREATE_WALLET_PROMPT,
      argsSchema: CreateWalletInput,
      func: createWallet,
    },
    agentkit
  );
};

export default createWalletTool;
