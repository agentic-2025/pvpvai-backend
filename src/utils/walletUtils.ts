import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';

export type NetworkId =
  | 'base-mainnet'
  | 'base-sepolia'
  | 'ethereum-mainnet'
  | 'polygon-mainnet'
  | 'arbitrum-mainnet'
  | 'solana-devnet';

interface CreateWalletResult {
  message: string;
  network: NetworkId;
  address: string;
  exportedData: any;
  savedTo: string;
}

const networkMap: Record<NetworkId, string> = {
  'base-mainnet': Coinbase.networks.BaseMainnet,
  'base-sepolia': Coinbase.networks.BaseSepolia,
  'ethereum-mainnet': Coinbase.networks.EthereumMainnet,
  'polygon-mainnet': Coinbase.networks.PolygonMainnet,
  'arbitrum-mainnet': Coinbase.networks.ArbitrumMainnet,
  'solana-devnet': Coinbase.networks.SolanaDevnet,
};

export const chainIdToNetwork: Record<number, NetworkId> = {
  8453: 'base-mainnet',
  84532: 'base-sepolia',
  1: 'ethereum-mainnet',
  137: 'polygon-mainnet',
  42161: 'arbitrum-mainnet',
  // Solana devnet doesn't use EVM chain IDs
};

export async function createAndSaveWalletToFile(
  networkId?: NetworkId
): Promise<CreateWalletResult> {
  try {
    const coinbaseNetworkId = networkId ? networkMap[networkId] : Coinbase.networks.BaseSepolia;

    // Create the wallet
    const wallet = await Wallet.create({ networkId: coinbaseNetworkId });

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

    return {
      message: 'Wallet created successfully',
      network: networkId || 'base-sepolia',
      address: address.toString(),
      exportedData: JSON.stringify(exportedData),
      savedTo: walletPath,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
    throw new Error('Failed to create wallet: Unknown error');
  }
}
