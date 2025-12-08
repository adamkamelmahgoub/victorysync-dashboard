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

