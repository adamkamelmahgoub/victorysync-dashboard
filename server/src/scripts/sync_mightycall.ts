import '../config/env';
import fetch from 'node-fetch';
import { getSupabaseAdminClient, supabaseAdmin as _maybeSupabaseAdmin } from '../lib/supabaseClient';

// Types for MightyCall responses
interface MightyCallAuthResponse {
  isSuccess: boolean;
  data?: { accessToken?: string } | null;
  [k: string]: any;
}

interface MightyCallNumber {
  id: string;
  number: string;
  e164?: string | null;
  label?: string | null;
  numberDigits?: string | number | null;
  isEnabled?: boolean | null;
  [k: string]: any;
}

async function getAccessToken(baseUrl: string, apiKey: string, userKey: string): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/auth/token`;
  const body = {
    apiKey,
    userKey,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: MightyCallAuthResponse | null = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error('[MightyCall auth] failed to parse response', text);
    throw new Error('Invalid auth response');
  }

  if (!res.ok || !json?.isSuccess) {
    console.error('[MightyCall auth] request failed', { status: res.status, body: json ?? text });
    throw new Error('Failed to obtain MightyCall access token');
  }

  const token = (json.data as any)?.accessToken || (json.data as any)?.access_token || null;
  if (!token) {
    console.error('[MightyCall auth] no access token in response', json);
    throw new Error('No access token');
  }
  return token;
}

async function fetchPhoneNumbers(baseUrl: string, accessToken: string, apiKey: string): Promise<MightyCallNumber[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/phonenumbers`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error('[MightyCall phonenumbers] failed to parse response', text);
    throw new Error('Invalid phonenumbers response');
  }

  if (!res.ok || !json?.isSuccess) {
    console.error('[MightyCall phonenumbers] request failed', { status: res.status, body: json ?? text });
    throw new Error('Failed to fetch phone numbers');
  }

  const list = json?.data?.phoneNumbers ?? json?.data ?? json?.phoneNumbers ?? [];
  if (!Array.isArray(list)) {
    console.warn('[MightyCall phonenumbers] unexpected data shape, returning empty array', { list });
    return [];
  }

  return list as MightyCallNumber[];
}

async function main() {
  // Load env vars via config helper exposure on process.env (src/config/env loads them)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const MIGHTYCALL_API_KEY = process.env.MIGHTYCALL_API_KEY;
  const MIGHTYCALL_USER_KEY = process.env.MIGHTYCALL_USER_KEY;
  const MIGHTYCALL_BASE_URL = process.env.MIGHTYCALL_BASE_URL;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    process.exit(1);
  }
  if (!MIGHTYCALL_API_KEY || !MIGHTYCALL_USER_KEY || !MIGHTYCALL_BASE_URL) {
    console.error('MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, and MIGHTYCALL_BASE_URL must be set');
    process.exit(1);
  }

  // Use existing Supabase admin client helper if available
  const supabaseAdmin = (typeof getSupabaseAdminClient === 'function') ? getSupabaseAdminClient() : (_maybeSupabaseAdmin as any);

  if (!supabaseAdmin) {
    console.error('Failed to obtain Supabase admin client');
    process.exit(1);
  }

  console.info('[MightyCall sync] getting access token');
  const token = await getAccessToken(MIGHTYCALL_BASE_URL, MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY);
  console.info('[MightyCall sync] fetched access token');

  console.info('[MightyCall sync] fetching phone numbers');
  const numbers = await fetchPhoneNumbers(MIGHTYCALL_BASE_URL, token, MIGHTYCALL_API_KEY);
  console.info('[MightyCall sync] fetched', numbers.length, 'phone numbers');

  if (numbers.length === 0) {
    console.info('[MightyCall sync] no phone numbers to upsert');
    return 0;
  }

  const rows = numbers.map((n) => ({
    external_id: String(n.id),
    number: String(n.number ?? ''),
    label: n.label ?? null,
    e164: n.e164 ?? null,
    number_digits: (n.numberDigits ?? (String(n.number || n.e164 || '').replace(/\D/g, ''))) || null,
    is_active: (n.isEnabled === undefined || n.isEnabled === null) ? true : !!n.isEnabled,
  }));

  console.info('[MightyCall sync] upserting', rows.length, 'rows into phone_numbers');
  const { data, error } = await supabaseAdmin.from('phone_numbers').upsert(rows, { onConflict: 'external_id' });
  if (error) {
    console.error('[MightyCall sync] upsert error', error);
    throw error;
  }

  console.info('[MightyCall sync] upserted', (data as any)?.length ?? rows.length, 'rows into phone_numbers');
  return (data as any)?.length ?? rows.length;
}

if (require.main === module) {
  main()
    .then((count) => {
      console.info('[MightyCall sync] complete - upserted', count);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MightyCall sync] Fatal error:', err);
      process.exit(1);
    });
}
// Legacy script replaced by sync_mightycall_clean.ts
// This file is not used; see sync_mightycall_clean.ts instead
export default {};
