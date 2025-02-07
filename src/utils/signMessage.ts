// TODO this is not a backend script, but a sig POC

import { Wallet } from 'ethers';
import { sortObjectKeys } from './sortObjectKeys';

export interface MessageContent {
  timestamp: number;
  roomId: string;
  roundId: string;
  agentId: string;
  text: string;
}

export const signMessage = async (
  content: MessageContent,
  privateKey: string
): Promise<string> => {
  try {
    // Extract only the fields that should be signed
    const signedContent = {
      timestamp: content.timestamp,
      roomId: content.roomId,
      roundId: content.roundId,
      agentId: content.agentId,
      text: content.text
    };

    // Use deterministic stringification
    const messageString = JSON.stringify(sortObjectKeys(signedContent));
    
    // Create wallet and sign
    const wallet = new Wallet(privateKey);
    const signature = await wallet.signMessage(messageString);
    
    return signature;
  } catch (error) {
    throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
