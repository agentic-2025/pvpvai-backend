import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';
import { z } from 'zod';
import { supabase } from '../../config';

// Define the prompt for the wallet creation action
const CREATE_WALLET_PROMPT = `
This tool creates a new wallet on a specified network using the Coinbase SDK.
If no network is specified, it defaults to Base Sepolia testnet.
You may optionally specify an agent id and room id, when you provide this, this function will save the wallet to the room_agents table, provided one doesn't already exist.
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
    agentId: z.number().optional().describe('The agent id to save the wallet to'),
    roomId: z.number().optional().describe('The room id to save the wallet to'),
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
    console.log('Creating wallet', args);
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
    const agentId = args.agentId;
    const roomId = args.roomId;
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

    if (agentId && roomId) {
      // First check if wallet_json is null
      const { data: existingData } = await supabase
        .from('room_agents')
        .select('wallet_json')
        .eq('agent_id', agentId)
        .eq('room_id', roomId)
        .single();

      if (!existingData) {
        console.log(
          `Agent ${agentId} does not exist in room ${roomId}, cannot add wallet to supabase`
        );
      } else {
        // Only update if wallet_json is null
        if (!existingData?.wallet_json) {
          console.log(
            `Saving wallet to database for agent ${agentId} in room ${roomId}: ${JSON.stringify(wallet.export())}`
          );
          const { data, error } = await supabase
            .from('room_agents')
            .update({ wallet_json: JSON.stringify(wallet.export()) })
            .eq('agent_id', agentId)
            .eq('room_id', roomId);

          if (error) {
            console.log(`Failed to update wallet in database: ${error.message}`);
          }
          console.log(`Successfully set wallet for agent ${agentId} in room ${roomId}`, data);
        } else {
          console.log(`Agent ${agentId} already has a wallet for room ${roomId}, skipping update`);
        }
      }
    }

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
