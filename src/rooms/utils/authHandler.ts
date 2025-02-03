import { Wallet } from 'ethers';
import { AuthenticatedMessage } from '../../types/ws';

export const signMessage = async (wallet: Wallet, type: string, messageContent: any): Promise<{
    timestamp: number,
    signature: string,
}> => {
  const timestamp = Date.now();
  // Combine timestamp and message into a single string
  const messageString = JSON.stringify({
    timestamp,
    content: messageContent,
  });

  // Sign the message using ethers
  const signature = await wallet.signMessage(messageString);

  return {
    timestamp,
    signature
  };
};
