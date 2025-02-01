import { createClient } from '@supabase/supabase-js';
import { Database } from './types/database.types';
import { WSOperations } from './ws/operations';

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
