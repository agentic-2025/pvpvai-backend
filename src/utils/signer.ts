import { Wallet } from 'ethers';
import { sortObjectKeys } from './sortObjectKeys';

/**
 * Signs a payload after sorting its keys.
 * This ensures a deterministic string representation for signing.
 */
export async function signPayload(wallet: Wallet, payload: any): Promise<string> {
  const sortedPayload = sortObjectKeys(payload);
  const payloadStr = JSON.stringify(sortedPayload);
  return wallet.signMessage(payloadStr);
} 