import { Wallet, getBytes, hashMessage, recoverAddress } from 'ethers';
import { backendEthersSigningWallet } from '../config';

type VerificationResult = {
  signer: string;
  error?: string;
};

export const verifySignedMessage = (
  content: any,
  signature: string,
  sender: string,
  timestamp: number,
  signatureWindowMs: number
): VerificationResult => {
  // Check that message is recent
  const now = Date.now();

  if (timestamp > now) {
    return {
      signer: sender,
      error:
        'Timestamp is in the future. Ensure your timestamp is in millisecond precision and is in UTC.',
    };
  }

  if (now - timestamp > signatureWindowMs) {
    return {
      signer: sender,
      error:
        'Signature expired. Please ensure your timestamp has millisecond precision, is in UTC, and is within the signature window.',
    };
  }

    const messageString = JSON.stringify(content);
    const hash = hashMessage(messageString);
    const digest = getBytes(hash);
    const recoveredAddress = recoverAddress(digest, signature);

    if (recoveredAddress.toLowerCase() !== sender.toLowerCase()) {
      return {
        signer: recoveredAddress,
        error: `Signature verification failed, expected sender address: ${sender} but recovered address: ${recoveredAddress}`,
      };
    }

    return {
      signer: recoveredAddress,
    };
 
};

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
