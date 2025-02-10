import { Wallet, getBytes, hashMessage, recoverAddress } from 'ethers';
import { SIGNER_PRIVATE_KEY } from '../config';

type VerificationResult = {
  signer: string;
  error?: string;
};

// Helper function for deterministic stringification (MUST MATCH CLIENT)
export function sortObjectKeys(obj: any): any {
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

/**
 * Signs a payload after sorting its keys.
 * This ensures a deterministic string representation for signing.
 */
export async function signPayload(wallet: Wallet, payload: any): Promise<string> {
  const sortedPayload = sortObjectKeys(payload);
  const payloadStr = JSON.stringify(sortedPayload);
  return wallet.signMessage(payloadStr);
}

export const signMessage = async (
  content: object,
  privateKey: string = SIGNER_PRIVATE_KEY || ''
): Promise<string> => {
  try {
    // Use deterministic stringification
    const messageString = JSON.stringify(sortObjectKeys(content));

    // Create wallet and sign
    const wallet = new Wallet(privateKey);
    const signature = await wallet.signMessage(messageString);

    return signature;
  } catch (error) {
    throw new Error(
      `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}; // TODO this is not a backend script, but a sig POC
