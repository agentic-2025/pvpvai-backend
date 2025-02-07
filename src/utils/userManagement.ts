import { supabase } from '../config';
import { Database } from '../types/database.types';

export async function getOrCreateUser(address: string, chainId: string = '8453') {
  // First try to get the user
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select()
    .eq('address', address.toLowerCase())
    .single();

  if (fetchError && fetchError.code === 'PGRST116') {
    // User not found, create new user
    // Note: This is a fallback mechanism for users who haven't gone through normal onboarding
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        address: address.toLowerCase(),
        chain_id: chainId,
        display_name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    return newUser;
  } else if (fetchError) {
    throw new Error(`Error fetching user: ${fetchError.message}`);
  }

  return existingUser;
} 