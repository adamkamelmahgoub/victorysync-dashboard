import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, MIGHTYCALL_BASE_URL } from '../config/env';

// Lightweight retry wrapper for node-fetch to handle transient network failures.
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, opts: any, retries = 2, backoffMs = 250) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const res = await fetch(url, opts);
      return res;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isNetworkErr = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg);
      console.warn(`[MightyCall] request error (attempt ${attempt}/${retries + 1})`, { url, msg });
      if (!isNetworkErr || attempt > retries) {
        // rethrow the original error if it's not retryable or retries exhausted
        throw err;
      }
      // backoff before retrying
      await delay(backoffMs * attempt);
    }
  }
}

export interface MightyCallPhoneNumber {
  externalId: string;
  e164: string;
  number: string;
  numberDigits: string;
  label: string | null;
  isActive: boolean;
}

/**
 * Get MightyCall access token using client credentials.
 * Tries form-encoded body with grant_type=client_credentials first,
 * then falls back to JSON body if that fails.
 */
export async function getMightyCallAccessToken(): Promise<string> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/auth/token`;

  // Try 1: form-encoded with grant_type=client_credentials
  const formData = new URLSearchParams();
  formData.append('grant_type', 'client_credentials');
  formData.append('client_id', MIGHTYCALL_API_KEY || '');
  formData.append('client_secret', MIGHTYCALL_USER_KEY || '');

  const res = await requestWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  }, 2, 300);

  const text = await res.text();
  if (!res.ok) {
    console.error('[MightyCall] auth/token failed', { url, status: res.status, body: text });
    throw new Error(`Failed to obtain MightyCall auth token (status ${res.status}): ${text}`);
  }

  try {
    const json = JSON.parse(text);
    const token = json?.access_token || json?.token || null;
    if (!token) throw new Error(`no access_token in response: ${text}`);
    return token;
  } catch (err: any) {
    console.error('[MightyCall] auth/token parse error', { url, status: res.status, body: text });
    throw new Error('Failed to parse MightyCall auth token response');
  }
}

/**
 * Fetch phone numbers from MightyCall API.
 * Tries multiple endpoint paths to find the correct one.
 * Requires a valid access token from getMightyCallAccessToken().
 */
export async function fetchMightyCallPhoneNumbers(accessToken: string): Promise<MightyCallPhoneNumber[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');

  // Try multiple endpoint variations
  const endpoints = [
    '/phonenumbers',
    '/phone_numbers',
    '/api/phonenumbers',
    '/api/phone_numbers',
    '/v4/phonenumbers',
    '/v4/phone_numbers',
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const url = `${baseUrl}${endpoint}`;

    try {
      const res = await requestWithRetry(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': MIGHTYCALL_API_KEY || '',
          Accept: 'application/json',
        },
      }, 2, 300);

      // If we get a 404, try the next endpoint
      if (res.status === 404) {
        lastError = new Error(`Endpoint not found: ${endpoint}`);
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        console.error('[MightyCall] phonenumbers request failed', { url, status: res.status, body: text });
        throw new Error(`MightyCall phonenumbers request failed (status ${res.status})`);
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch (err) {
        console.error('[MightyCall] failed to parse phonenumbers response', { url, status: res.status, err });
        throw new Error('Failed to parse phonenumbers response');
      }

      // Log raw response for debugging
      console.log('[MightyCall] raw phonenumbers response:', JSON.stringify(json, null, 2));

      // Parse response: { data: { phoneNumbers: [...], ... }, isSuccess: true }
      const list = json?.data?.phoneNumbers ?? [];
      if (!Array.isArray(list)) {
        console.error('[MightyCall] unexpected response shape', { url, status: res.status, body: json });
        return [];
      }

      // Map to our interface
      const mapped: MightyCallPhoneNumber[] = list.map((n: any) => {
        // Use objectGuid as the stable unique external ID
        const externalId = String(n.objectGuid ?? n.id ?? n.phoneNumberId ?? n.phoneNumber);
        // Extract the phone number (MightyCall provides it as 'number')
        const phoneNumber = n.number ?? n.phoneNumber ?? '';
        // Derive e164 format if not provided
        const e164Val = n.e164 ?? phoneNumber;
        // Extract digits only
        const digits = (phoneNumber || e164Val || '').replace(/\D/g, '');

        return {
          externalId,
          e164: e164Val,
          number: phoneNumber,
          numberDigits: digits,
          label: n.label ?? n.description ?? null,
          // Map isEnabled or isActive to our isActive field
          isActive: n.isEnabled ?? (n.subscriptionState === 'subscribed' || n.subscriptionState === 'active'),
        };
      });

      console.log(`[MightyCall] successfully fetched from ${endpoint}`);
      return mapped;
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  // If we get here, none of the endpoints worked
  console.error('[MightyCall] could not find working phonenumbers endpoint', { lastError: lastError?.message });
  throw new Error(`Failed to fetch phone numbers: ${lastError?.message ?? 'no endpoints responded correctly'}`);
}

/**
 * Fetch extensions (if available) from MightyCall. Returns simplified extension objects.
 */
export async function fetchMightyCallExtensions(accessToken?: string): Promise<Array<{ id: string; extension: string; display_name: string }>> {
  const token = accessToken || (await getMightyCallAccessToken());
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/extensions`;

  try {
    const res = await requestWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 1, 200);

    if (!res.ok) {
      console.warn('[MightyCall] extensions request failed', res.status);
      return [];
    }

    const text = await res.text();
    const json = JSON.parse(text || 'null');
    const list = json?.data ?? json?.extensions ?? [];
    if (!Array.isArray(list)) return [];

    return list.map((e: any) => {
      const id = String(e.id ?? e.extensionId ?? '');
      const extension = String(e.extension ?? e.number ?? '');
      const display_name = String(e.displayName ?? e.display_name ?? '');
      return { id, extension, display_name };
    });
  } catch (err) {
    console.warn('[MightyCall] fetch extensions error', err);
    return [];
  }
}

/**
 * Sync phone numbers into a Supabase admin client.
 * Returns { upserted } count.
 */
export async function syncMightyCallPhoneNumbers(supabaseAdminClient: any): Promise<{ upserted: number }> {
  const token = await getMightyCallAccessToken();
  const numbers = await fetchMightyCallPhoneNumbers(token);
  if (!Array.isArray(numbers) || numbers.length === 0) return { upserted: 0 };

  const rows = numbers.map(n => ({ external_id: n.externalId, e164: n.e164, number: n.number, number_digits: n.numberDigits, label: n.label, is_active: n.isActive }));

  const { data, error } = await supabaseAdminClient.from('phone_numbers').upsert(rows, { onConflict: 'external_id' });
  if (error) {
    console.warn('[MightyCall sync] upsert error', error);
    throw error;
  }

  return { upserted: (data?.length ?? rows.length) };
}
