import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, MIGHTYCALL_BASE_URL } from '../config/env';

const MC_BASE = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
const MC_API_KEY = MIGHTYCALL_API_KEY || '';
const MC_USER_KEY = MIGHTYCALL_USER_KEY || '';

export interface MightyCallPhoneNumber {
  id: string; // external id
  phoneNumber?: string; // possible field name
  e164?: string;
  number?: string;
  name?: string;
  label?: string;
  isActive?: boolean;
  [k: string]: any;
}

async function getAuthToken(): Promise<string> {
  if (!MC_BASE || !MC_API_KEY || !MC_USER_KEY) {
    throw new Error('MIGHTYCALL_BASE_URL, MIGHTYCALL_API_KEY, and MIGHTYCALL_USER_KEY must be set');
  }

  const url = `${MC_BASE}/auth/token`;
  const body = { client_id: MC_API_KEY, client_secret: MC_USER_KEY };

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    console.error('[MightyCall] auth/token failed', { url, status: res.status, body: text });
    throw new Error(`Failed to obtain MightyCall auth token (status ${res.status})`);
  }

  try {
    const json = JSON.parse(text);
    const token = json?.access_token || json?.token || null;
    if (!token) throw new Error(`no access_token in response: ${text}`);
    return token;
  } catch (err: any) {
    console.error('[MightyCall] auth/token parse error', { url, status: res.status, body: text, err: err?.message ?? err });
    throw new Error('Failed to parse MightyCall auth token response');
  }
}

export async function fetchMightyCallPhoneNumbers(): Promise<MightyCallPhoneNumber[]> {
  if (!MC_BASE) {
    console.error('[MightyCall] base URL missing');
    return [];
  }
  try {
    const token = await getAuthToken();

    const url = `${MC_BASE}/api/phonenumbers`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-api-key': MC_API_KEY } });
    const status = res.status;
    let json: any;
    try {
      json = await res.json();
    } catch (err) {
      const text = await res.text().catch(() => '<no-body>');
      console.error('[MightyCall] failed to parse JSON from phonenumbers', { url, status, err, bodyText: text });
      throw new Error('Failed to parse phonenumbers response');
    }

    // Log raw response for debugging
    console.log('[MightyCall sync] raw phonenumbers response:', JSON.stringify(json, null, 2));

    if (!res.ok) {
      console.error('[MightyCall] phonenumbers request failed', { url, status, body: json });
      throw new Error(`MightyCall phonenumbers request failed (status ${status})`);
    }

    // The API wraps data in { data: { phoneNumbers: [...] }, isSuccess: true }
    const success = json?.isSuccess === true || json?.success === true || json?.status === 'success';
    if (!success && !(Array.isArray(json?.data) || Array.isArray(json?.data?.phoneNumbers))) {
      console.error('[MightyCall] API returned unexpected body', { url, status, body: json });
      return [];
    }

    const phoneData = json?.data?.phoneNumbers || json?.data || [];
    if (!Array.isArray(phoneData)) {
      console.warn('[MightyCall] unexpected phoneNumbers shape', { url, status, body: json });
      return [];
    }

    // Map to our minimal shape
    const mapped: MightyCallPhoneNumber[] = phoneData.map((p: any) => ({
      id: p.id || p.externalId || p.phoneId || String(Math.random()),
      phoneNumber: p.phoneNumber || p.number || p.e164 || p.msisdn || null,
      e164: p.e164 || p.phoneNumber || p.number || null,
      number: p.number || p.phoneNumber || p.e164 || null,
      name: p.name || p.label || null,
      label: p.label || p.name || null,
      isActive: p.isActive ?? (p.active ?? true),
      raw: p,
    }));

    return mapped;
  } catch (err: any) {
    console.error('[MightyCall] fetchMightyCallPhoneNumbers error', err?.message ?? err);
    return [];
  }
}

export async function listActivePhoneNumbersFromDB(supabaseClient: any) {
  return supabaseClient.from('phone_numbers').select('id, number, label, org_id, is_active').eq('is_active', true);
}

export default { getAuthToken, fetchMightyCallPhoneNumbers, listActivePhoneNumbersFromDB };
