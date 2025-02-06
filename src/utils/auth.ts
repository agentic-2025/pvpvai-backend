import { Wallet, getBytes, hashMessage, recoverAddress } from 'ethers';
import { backendEthersSigningWallet } from '../config';

type VerificationResult = {
  signer: string;
  error?: string;
};

// Helper function for deterministic stringification (MUST MATCH CLIENT)
function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj; // Return as is if not an object
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys); // Recursively sort arrays
  }

  const sortedObj: { [key: string]: any } = {};
  Object.keys(obj)
    .sort() // Sort keys alphabetically
    .forEach((key) => {
      sortedObj[key] = sortObjectKeys(obj[key]); // Recursively sort nested objects
    });

  return sortedObj;
}

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

  // *** Deterministic Stringification (CRITICAL) ***
  const messageString = JSON.stringify(sortObjectKeys(content));

  const hash = hashMessage(messageString);
  const digest = getBytes(hash);
  const recoveredAddress = recoverAddress(digest, signature);

  if (recoveredAddress.toLowerCase() !== sender.toLowerCase()) {
    return {
      signer: recoveredAddress,
      error: `Signature verification failed, expected sender address: ${sender} but recovered address: ${recoveredAddress}.  Message string: ${messageString}`, // Added message string to error
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
  // *** Deterministic Stringification (CRITICAL) ***
  const messageString = JSON.stringify(sortObjectKeys(messageContent));

  // Sign the message using ethers
  const signature = await wallet.signMessage(messageString);

  return signature;
};