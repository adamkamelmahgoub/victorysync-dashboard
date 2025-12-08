/**
 * Server Environment Configuration
 * 
 * PRODUCTION ENVIRONMENT VARIABLES (set these on Vercel):
 * 
 * REQUIRED CORE VARS:
 * - SUPABASE_URL: Your Supabase project URL
 *   Example: https://your-project.supabase.co
 *   Get it from: Supabase Dashboard → Settings → API → Project URL
 * 
 * - SUPABASE_SERVICE_KEY: Supabase service role key (for admin operations)
 *   Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *   Get it from: Supabase Dashboard → Settings → API → Service Role Key
 *   ⚠️ KEEP THIS SECRET! Never commit to git.
 * 
 * REQUIRED FOR MIGHTYCALL SYNC:
 * - MIGHTYCALL_API_KEY: MightyCall API key for authentication
 * - MIGHTYCALL_USER_KEY: MightyCall user/account key
 * - MIGHTYCALL_BASE_URL: MightyCall API base URL (default: https://ccapi.mightycall.com/v4)
 * 
 * LOCAL DEVELOPMENT:
 * - Create a .env file in the server root directory with all of the above
 * - Run: npm run dev
 * - The app will auto-load variables from .env
 * 
 * VERCEL DEPLOYMENT:
 * - Go to: Vercel Dashboard → Your Project → Settings → Environment Variables
 * - Add each variable name and its value
 * - Redeploy for changes to take effect
 */

import path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Always load the .env that sits in the server root folder
// (server/.env), regardless of where the compiled file lives.
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

// If dotenv didn't populate the expected MightyCall vars (some sync/FS
// edge-cases can happen on OneDrive), try a conservative parse fallback
// using `dotenv.parse` on the file contents and merge any missing keys.
try {
  const need = !process.env.MIGHTYCALL_API_KEY || !process.env.MIGHTYCALL_USER_KEY;
  if (need) {
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      const parsed = dotenv.parse(raw);
      if (parsed.MIGHTYCALL_API_KEY && !process.env.MIGHTYCALL_API_KEY) process.env.MIGHTYCALL_API_KEY = parsed.MIGHTYCALL_API_KEY;
      if (parsed.MIGHTYCALL_USER_KEY && !process.env.MIGHTYCALL_USER_KEY) process.env.MIGHTYCALL_USER_KEY = parsed.MIGHTYCALL_USER_KEY;
      if (parsed.MIGHTYCALL_BASE_URL && !process.env.MIGHTYCALL_BASE_URL) process.env.MIGHTYCALL_BASE_URL = parsed.MIGHTYCALL_BASE_URL;
    } catch (e) {
      // ignore file-read errors; we'll validate below and throw a helpful error
    }
  }
} catch (e) {
  // silent
}

// Read variables once
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export const MIGHTYCALL_API_KEY = process.env.MIGHTYCALL_API_KEY;
export const MIGHTYCALL_USER_KEY = process.env.MIGHTYCALL_USER_KEY;
export const MIGHTYCALL_BASE_URL = process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4';

// Simple validation – if anything critical is missing, log and throw
const missing: string[] = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
if (!MIGHTYCALL_API_KEY) missing.push('MIGHTYCALL_API_KEY');
if (!MIGHTYCALL_USER_KEY) missing.push('MIGHTYCALL_USER_KEY');

if (missing.length > 0) {
  console.error('[env] Using file:', envPath);
  console.error('[env] Environment variables missing:', missing.join(', '));
  throw new Error('Required environment variables are missing');
}

// For debugging, but concise – this should show `true` for API_KEY and USER_KEY.
console.log('[env] Loaded MightyCall envs:', {
  MIGHTYCALL_API_KEY: !!MIGHTYCALL_API_KEY,
  MIGHTYCALL_USER_KEY: !!MIGHTYCALL_USER_KEY,
  MIGHTYCALL_BASE_URL: MIGHTYCALL_BASE_URL,
});

