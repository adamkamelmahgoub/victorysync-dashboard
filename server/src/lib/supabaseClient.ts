import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../config/env';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY missing');
}

// Public client (uses anon/public key if desired)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Admin/service-role client for server-side operations
export const supabaseAdminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function getSupabaseAdminClient(): SupabaseClient {
  return supabaseAdminClient;
}

// Backwards-compatible alias
export const supabaseAdmin = supabaseAdminClient;
