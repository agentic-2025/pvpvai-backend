import { getBytes, hashMessage, recoverAddress, Wallet } from 'ethers';
import { sortObjectKeys } from './sortObjectKeys';

/**
 * IMPORTANT: Message Signing Protocol
 * 
 * Only core message fields are included in signature verification:
 * - timestamp
 * - roomId
 * - roundId
 * - agentId
 * - text
 * 
 * Additional fields like 'context' and 'messageHistory' are NOT part of the signed content.
 * This ensures signature verification remains consistent even if context changes.
 * 
 * The signing process:
 * 1. Extract core fields to be signed
 * 2. Sort object keys recursively
 * 3. JSON.stringify the sorted object
 * 4. Sign/verify the resulting string
 */


interface VerificationResult {
  signer: string;
  error?: string;
}

export const signMessage = async (
  content: object, 
  privateKey: string
): Promise<string> => {
  try {
    // Use determincccccblefrehlgtdiikknkitbeuddndcehrducrlnlhf
    // istic stringification
    const messageString = JSON.stringify(sortObjectKeys(content));
    const wallet = new Wallet(privateKey);
    return await wallet.signMessage(messageString);
  } catch (error) {
    throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const verifySignedMessage = (
  content: object,
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

  try {
    // Extract only the fields that should be signed
    const signedContent = {
      timestamp: content.timestamp,
      roomId: content.roomId,
      roundId: content.roundId,
      agentId: content.agentId,
      text: content.text,
    };

    // Use deterministic stringification on the same fields as client
    const messageString = JSON.stringify(sortObjectKeys(signedContent));

    // Log for debugging
    console.log('Verifying content:', signedContent);
    console.log('Message string:', messageString);

    const hash = hashMessage(messageString);
    const digest = getBytes(hash);
    const recoveredAddress = recoverAddress(digest, signature);

    if (recoveredAddress.toLowerCase() !== sender.toLowerCase()) {
      return {
        signer: recoveredAddress,
        error: `Signature verification failed, expected sender address: ${sender} but recovered address: ${recoveredAddress}. Message string: ${messageString}`,
      };
    }

    return {
      signer: recoveredAddress,
    };
  } catch (error) {
    return {
      signer: sender,
      error: `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};