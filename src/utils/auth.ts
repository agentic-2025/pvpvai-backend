import { Wallet } from 'ethers';
import { backendEthersSigningWallet } from '../config';

export const signMessage = async (
  messageContent: any,
  wallet: Wallet = backendEthersSigningWallet
): Promise<string> => {
  const timestamp = Date.now();
  // Combine timestamp and message into a single string
  const messageString = JSON.stringify({
    content: messageContent,
  });

  // Sign the message using ethers
  const signature = await wallet.signMessage(messageString);

  return signature;
};
