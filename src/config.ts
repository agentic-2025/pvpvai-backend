import { createClient } from '@supabase/supabase-js';
import { Database } from './types/database.types';
import { WSOperations } from './ws/operations';
import { Wallet } from 'ethers';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
// const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; //This is the admin key, use with caution
if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
}

export const wsOps = new WSOperations();
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
export const AGENT_ENDPOINT = process.env.AGENT_ENDPOINT || '';
export const SIGNATURE_WINDOW_MS = process.env.SIGNATURE_WINDOW_MS
  ? parseInt(process.env.SIGNATURE_WINDOW_MS)
  : 5 * 1000; // 5 seconds in millisecons

// Private key should be loaded from environment variables or secure configuration
export const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
if (!SIGNER_PRIVATE_KEY) {
  throw new Error('SIGNER_PRIVATE_KEY environment variable is required');
}

 export const etherSigningWallet = new Wallet(SIGNER_PRIVATE_KEY);