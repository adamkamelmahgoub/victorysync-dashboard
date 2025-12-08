import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, MIGHTYCALL_BASE_URL } from '../config/env';

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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

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
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': MIGHTYCALL_API_KEY || '',
          Accept: 'application/json',
        },
      });

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
