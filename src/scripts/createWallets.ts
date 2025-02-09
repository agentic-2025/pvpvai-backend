import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import * as fs from 'fs';
import * as path from 'path';

async function createWallets() {
  // Configure Coinbase SDK
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY_NAME!,
    privateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  });

  const networkId = 'base-sepolia';
  const walletDir = path.join(process.cwd(), 'wallets', networkId);
  const numberOfWallets = 5;

  // Create directories if they don't exist
  fs.mkdirSync(walletDir, { recursive: true });

  for (let i = 0; i < numberOfWallets; i++) {
    try {
      // Create a new wallet
      const wallet = await Wallet.create({
        networkId: networkId,
      });

      // Get the wallet data and address
      const walletData = await wallet.export();
      const addressObj = await wallet.getDefaultAddress();
      const address = addressObj.toString().match(/addressId: '([^']+)'/)?.[1] || '';

      // Save to file with just the address as filename
      const filePath = path.join(walletDir, `${address}.json`);
      fs.writeFileSync(filePath, JSON.stringify(walletData, null, 2));
      console.log(`Created wallet ${i + 1}/${numberOfWallets} - Address: ${address}`);
    } catch (error) {
      console.error(`Failed to create wallet ${i + 1}:`, error);
    }
  }

  console.log(`\nWallets have been created in: ${walletDir}`);
}

createWallets().catch(console.error);
