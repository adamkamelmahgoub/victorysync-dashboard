/**
 * Supabase Client Configuration
 * 
 * IMPORTANT FOR PRODUCTION:
 * This file creates a Supabase admin client using only process.env variables.
 * In Vercel or other Node.js hosts, ensure these env vars are set:
 * - SUPABASE_URL (e.g., https://xxxxx.supabase.co)
 * - SUPABASE_SERVICE_KEY (Service Role Key from Supabase settings)
 * 
 * The client is configured with autoRefreshToken: false and persistSession: false
 * because this is a server-side admin client, not a browser client.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read env vars directly from process.env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Validate at module load time
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  console.error('[supabaseClient] Missing environment variables:', missing.join(', '));
  console.error('[supabaseClient] SUPABASE_URL:', SUPABASE_URL ? '✓ set' : '✗ missing');
  console.error('[supabaseClient] SUPABASE_SERVICE_KEY:', SUPABASE_SERVICE_KEY ? '✓ set' : '✗ missing');
  throw new Error(`Supabase config failed: Missing ${missing.join(', ')}`);
}

// Create admin client with server-side config
export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Backwards compatibility: also export as supabase for existing code
export const supabase = supabaseAdmin;

export function getSupabaseAdminClient(): SupabaseClient {
  return supabaseAdmin;
}
