import { CdpTool } from '@coinbase/cdp-langchain';
import { z } from 'zod';
import { createAndSaveWalletToFile, NetworkId } from '../../utils/walletUtils';
import { supabase } from '../../config';
import {
  CdpAgentkit
} from '@coinbase/cdp-agentkit-core';
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

    const result = await createAndSaveWalletToFile(args.networkId as NetworkId);

    if (args.agentId && args.roomId) {
      // First check if wallet_json is null
      const { data: existingData } = await supabase
        .from('room_agents')
        .select('wallet_json')
        .eq('agent_id', args.agentId)
        .eq('room_id', args.roomId)
        .single();

      if (!existingData) {
        console.log(
          `Agent ${args.agentId} does not exist in room ${args.roomId}, cannot add wallet to supabase`
        );
      } else if (!existingData?.wallet_json) {
        console.log(
          `Saving wallet to database for agent ${args.agentId} in room ${args.roomId}: ${JSON.stringify(result.exportedData)}`
        );
        const { error } = await supabase
          .from('room_agents')
          .update({ wallet_json: JSON.stringify(result.exportedData) })
          .eq('agent_id', args.agentId)
          .eq('room_id', args.roomId);

        if (error) {
          console.log(`Failed to update wallet in database: ${error.message}`);
        }
        console.log(`Successfully set wallet for agent ${args.agentId} in room ${args.roomId}`);
      } else {
        console.log(
          `Agent ${args.agentId} already has a wallet for room ${args.roomId}, skipping update`
        );
      }
    }

    return JSON.stringify(result, null, 2);
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
