import { getBytes, hashMessage, recoverAddress } from 'ethers';

interface VerificationResult {
  signer: string;
  error?: string;
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
      error: 'Timestamp is in the future. Ensure your timestamp is in millisecond precision and is in UTC.'
    };
  }

  if (now - timestamp > signatureWindowMs) {
    return {
      signer: sender,
      error: 'Signature expired. Please ensure your timestamp has millisecond precision, is in UTC, and is within the signature window.'
    };
  }

  try {
    const messageString = JSON.stringify(content);
    const hash = hashMessage(messageString);
    const digest = getBytes(hash);
    const recoveredAddress = recoverAddress(digest, signature);

    if (recoveredAddress.toLowerCase() !== sender.toLowerCase()) {
      return {
        signer: recoveredAddress,
        error: `Signature verification failed, expected sender address: ${sender} but recovered address: ${recoveredAddress}`
      };
    }

    return {
      signer: recoveredAddress
    };
  } catch (error) {
    return {
      signer: sender,
      error: `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}; 