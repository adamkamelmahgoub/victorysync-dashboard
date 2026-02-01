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
export async function getMightyCallAccessToken(override?: { clientId?: string; clientSecret?: string }): Promise<string> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/auth/token`;

  const clientId = override?.clientId || MIGHTYCALL_API_KEY || '';
  const clientSecret = override?.clientSecret || MIGHTYCALL_USER_KEY || '';

  // Try 1: form-encoded with grant_type=client_credentials
  const formData = new URLSearchParams();
  formData.append('grant_type', 'client_credentials');
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);

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
  let lastFailureInfo: { url: string; status?: number; body?: string; message?: string } | null = null;

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
        lastFailureInfo = { url, status: res.status, message: `Endpoint not found: ${endpoint}` };
        lastError = new Error(`Endpoint not found: ${endpoint}`);
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        // capture body for final-failure logging and try other endpoints
        lastFailureInfo = { url, status: res.status, body: text, message: `phonenumbers request failed (status ${res.status})` };
        lastError = new Error(`MightyCall phonenumbers request failed (status ${res.status})`);
        console.error('[MightyCall] phonenumbers request failed', lastFailureInfo);
        continue;
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch (err) {
        // keep response body for diagnostics
        lastFailureInfo = { url, status: res.status, body: text, message: 'Failed to parse phonenumbers response' };
        console.error('[MightyCall] failed to parse phonenumbers response', lastFailureInfo);
        lastError = new Error('Failed to parse phonenumbers response');
        continue;
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
      // network / fetch errors - capture message and continue to try other endpoints
      lastFailureInfo = { url, message: err?.message ?? String(err) };
      lastError = err;
      console.warn('[MightyCall] endpoint attempt failed', lastFailureInfo);
      continue;
    }
  }

  // If we get here, none of the endpoints worked
  console.error('[MightyCall] could not find working phonenumbers endpoint', { lastError: lastError?.message, lastFailureInfo });
  const detail = lastFailureInfo?.message ?? lastError?.message ?? 'no endpoints responded correctly';
  const bodySnippet = lastFailureInfo?.body ? ` Response body: ${String(lastFailureInfo.body).slice(0, 2000)}` : '';
  throw new Error(`Failed to fetch phone numbers: ${detail}.${bodySnippet}`);
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
      const text = await res.text().catch(() => '');
      console.warn('[MightyCall] extensions request failed', { url, status: res.status, body: text });
      return [];
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text || 'null');
    } catch (err) {
      console.warn('[MightyCall] extensions parse error', { url, err, body: text });
      return [];
    }

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
export async function syncMightyCallPhoneNumbers(supabaseAdminClient: any, overrideCreds?: { clientId?: string; clientSecret?: string }): Promise<{ upserted: number }> {
  const token = await getMightyCallAccessToken(overrideCreds);
  const numbers = await fetchMightyCallPhoneNumbers(token);
  if (!Array.isArray(numbers) || numbers.length === 0) return { upserted: 0 };

  // Only upsert columns that exist in the schema
  const rows = numbers.map(n => ({ external_id: n.externalId, number: n.number, label: n.label }));

  // Perform per-row upsert with fallback to update-by-number when unique-number conflicts arise
  let upserted = 0;
  for (const r of rows) {
    const { data, error } = await supabaseAdminClient.from('phone_numbers').upsert(r, { onConflict: 'external_id' });
    if (error) {
      // handle duplicate-number unique constraint by updating the existing row by number
      if (String(error?.code) === '23505' && String(error?.details || '').includes('Key (number)')) {
        const { error: updateErr } = await supabaseAdminClient.from('phone_numbers').update(r).eq('number', r.number);
        if (updateErr) {
          console.warn('[MightyCall sync] update-by-number failed', updateErr);
          throw updateErr;
        }
        upserted += 1;
        continue;
      }

      console.warn('[MightyCall sync] upsert error', error);
      throw error;
    }

    upserted += 1;
  }

  return { upserted };
}

/**
 * Fetch call reports from MightyCall API.
 * Uses the Journal API to fetch call records and aggregate them into reports.
 * API Endpoint: GET /journal/requests
 */
export async function fetchMightyCallReports(accessToken: string, phoneNumberIds: string[], startDate: string, endDate: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/journal/requests`;

  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('from', startDate);
    params.append('to', endDate);
    params.append('type', 'Call');
    params.append('pageSize', '1000');
    params.append('page', '1');

    const fullUrl = `${url}?${params.toString()}`;
    console.log('[MightyCall] fetchReports - Calling:', fullUrl);

    const res = await requestWithRetry(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (res.status === 404) {
      console.error('[MightyCall] Journal requests endpoint not found (404)');
      return [];
    }

    const text = await res.text();
    console.log('[MightyCall] fetchReports - Response status:', res.status, 'body length:', text.length);

    if (!res.ok) {
      console.warn('[MightyCall] Journal requests failed', { status: res.status, body: text.substring(0, 500) });
      return [];
    }

    let json: any = null;
    try {
      json = JSON.parse(text || 'null');
    } catch (e) {
      console.warn('[MightyCall] Journal requests parse failed:', e);
      return [];
    }

    // Journal API returns { currentPage, requests: [...] }
    const list = json?.requests ?? json?.data?.requests ?? [];
    if (!Array.isArray(list)) {
      console.warn('[MightyCall] unexpected journal response shape', { keys: Object.keys(json || {}), body: JSON.stringify(json).substring(0, 200) });
      return [];
    }

    console.log(`[MightyCall] successfully fetched ${list.length} journal entries for reports`);
    return list as any[];
  } catch (err: any) {
    console.error('[MightyCall] Journal requests endpoint error', err?.message ?? String(err));
    return [];
  }
}

/**
 * Fetch voicemails from MightyCall API.
 */
export async function fetchMightyCallVoicemails(accessToken: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/voicemails`;

  try {
    const res = await requestWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (!res.ok) {
      const text = await res.text();
      console.warn('[MightyCall] voicemails request failed', { url, status: res.status, body: text });
      return [];
    }

    const json = await res.json();
    const list = json?.data?.voicemails ?? json?.voicemails ?? [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[MightyCall] fetch voicemails error', err);
    return [];
  }
}

/**
 * Fetch call history from MightyCall API.
 */
export async function fetchMightyCallCalls(accessToken: string, filters?: any): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');

  const endpoints = [
    '/api/calls',
    '/api/calls/list',
    '/calls',
    '/v4/calls',
    '/api/reports/calls'
  ];

  let lastFailure: any = null;
  for (const ep of endpoints) {
    const url = `${baseUrl}${ep}`;
    try {
      const params = new URLSearchParams();
      if (filters?.dateStart) params.append('dateStart', filters.dateStart);
      if (filters?.dateEnd) params.append('dateEnd', filters.dateEnd);
      if (filters?.limit) params.append('limit', String(filters.limit));
      const urlWithParams = params.toString() ? `${url}?${params.toString()}` : url;

      const res = await requestWithRetry(urlWithParams, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': MIGHTYCALL_API_KEY || '',
          Accept: 'application/json',
        },
      }, 2, 300);

      if (res.status === 404) {
        lastFailure = { url: urlWithParams, status: res.status, message: 'Endpoint not found' };
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        lastFailure = { url: urlWithParams, status: res.status, body: text };
        console.warn('[MightyCall] calls request failed', lastFailure);
        continue;
      }

      let json: any = null;
      try { json = JSON.parse(text || 'null'); } catch (e) { lastFailure = { url: urlWithParams, body: text }; console.warn('[MightyCall] calls parse failed', lastFailure); continue; }

      const list = json?.data?.calls ?? json?.calls ?? json?.data ?? [];
      // Debug: inspect response shape and list size
      try {
        console.log('[MightyCall] calls raw response keys:', Object.keys(json || {}));
        console.log('[MightyCall] calls list length:', Array.isArray(list) ? list.length : 'not-an-array');
        if (Array.isArray(list) && list.length > 0) console.log('[MightyCall] calls sample:', JSON.stringify(list.slice(0, 3), null, 2));
        else {
          // When list is empty, log a small snippet of the response body to discover where call items might be.
          try {
            const snippet = JSON.stringify(json || {}).slice(0, 2000);
            console.log('[MightyCall] calls raw body snippet (truncated):', snippet);
          } catch (e) {
            console.warn('[MightyCall] failed to stringify raw json snippet', e);
          }
        }
      } catch (e) {
        console.warn('[MightyCall] failed to log calls response', e);
      }

      if (!Array.isArray(list)) { console.warn('[MightyCall] unexpected calls response shape', { url: urlWithParams, body: json }); return []; }
      console.log(`[MightyCall] successfully fetched calls from ${ep}`);
      return list as any[];
    } catch (err: any) {
      lastFailure = { url: url, message: err?.message ?? String(err) };
      console.warn('[MightyCall] calls endpoint attempt failed', lastFailure);
      continue;
    }
  }

  console.error('[MightyCall] could not find working calls endpoint', lastFailure);
  return [];
}

/**
 * Fetch contacts from MightyCall API.
 */
export async function fetchMightyCallContacts(accessToken: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/contacts`;

  try {
    const res = await requestWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (!res.ok) {
      const text = await res.text();
      console.warn('[MightyCall] contacts request failed', { url, status: res.status, body: text });
      return [];
    }

    const json = await res.json();
    const list = json?.data?.contacts ?? json?.contacts ?? [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[MightyCall] fetch contacts error', err);
    return [];
  }
}

/**
 * Fetch call recordings from MightyCall API.
 * Recordings are attached to individual calls via the Journal/Calls API.
 * API Endpoint: GET /calls (returns calls with recording URLs) or GET /journal/requests
 */
export async function fetchMightyCallRecordings(accessToken: string, phoneNumberIds: string[], startDate: string, endDate: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  
  // Use the calls endpoint which includes recording info
  const url = `${baseUrl}/calls`;

  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('startUtc', startDate);
    params.append('endUtc', endDate);
    params.append('pageSize', '1000');
    params.append('skip', '0');

    const fullUrl = `${url}?${params.toString()}`;
    console.log('[MightyCall] fetchRecordings - Calling:', fullUrl);

    const res = await requestWithRetry(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (res.status === 404) {
      console.warn('[MightyCall] Calls endpoint not found (404), trying journal');
      // Fallback to journal endpoint for recordings
      return fetchMightyCallRecordingsFromJournal(accessToken, startDate, endDate);
    }

    const text = await res.text();
    console.log('[MightyCall] fetchRecordings - Response status:', res.status, 'body length:', text.length);

    if (!res.ok) {
      console.warn('[MightyCall] Calls request failed', { status: res.status, body: text.substring(0, 500) });
      return fetchMightyCallRecordingsFromJournal(accessToken, startDate, endDate);
    }

    let json: any = null;
    try { json = JSON.parse(text || 'null'); } catch (e) {
      console.warn('[MightyCall] Calls parse failed');
      return fetchMightyCallRecordingsFromJournal(accessToken, startDate, endDate);
    }

    const calls = json?.data?.calls ?? json?.calls ?? [];
    if (!Array.isArray(calls)) {
      console.warn('[MightyCall] unexpected calls response shape', { keys: Object.keys(json || {}), body: JSON.stringify(json).substring(0, 200) });
      return fetchMightyCallRecordingsFromJournal(accessToken, startDate, endDate);
    }

    // Extract calls with recordings
    const recordings = calls
      .filter((c: any) => c.callRecord && (c.callRecord.uri || c.callRecord.fileName))
      .map((c: any) => ({
        id: c.id,
        callId: c.id,
        recordingUrl: c.callRecord.uri || c.callRecord.fileName,
        duration: c.duration ? parseInt(c.duration, 10) : null,
        date: c.dateTimeUtc,
        metadata: c
      }));

    console.log(`[MightyCall] successfully fetched ${recordings.length} recordings from calls API`);
    return recordings;
  } catch (err: any) {
    console.error('[MightyCall] Calls endpoint error', err?.message ?? String(err));
    return fetchMightyCallRecordingsFromJournal(accessToken, startDate, endDate);
  }
}

/**
 * Fallback: Fetch recordings from Journal API
 */
async function fetchMightyCallRecordingsFromJournal(accessToken: string, startDate: string, endDate: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/journal/requests`;

  try {
    const params = new URLSearchParams();
    params.append('from', startDate);
    params.append('to', endDate);
    params.append('type', 'Call');
    params.append('pageSize', '1000');
    params.append('page', '1');

    const res = await requestWithRetry(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (!res.ok) {
      console.error('[MightyCall] Journal fallback failed', { status: res.status });
      return [];
    }

    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text || 'null'); } catch (e) {
      return [];
    }

    const requests = json?.requests ?? [];
    // Recordings in journal are in the textModel or attachments
    const recordings = requests
      .filter((r: any) => r.textModel && r.textModel.text)
      .map((r: any) => ({
        id: r.id,
        callId: r.id,
        recordingUrl: r.textModel.text,
        duration: null,
        date: r.created,
        metadata: r
      }));

    console.log(`[MightyCall] fallback journal fetch: ${recordings.length} records`);
    return recordings;
  } catch (err: any) {
    console.error('[MightyCall] Journal fallback error', err?.message ?? String(err));
    return [];
  }
}

/**
 * Try to fetch SMS/messages from MightyCall API.
 * API Endpoint: GET /journal/requests (with type=Message filter) or /messages/list for sent messages
 */
export async function fetchMightyCallSMS(accessToken?: string): Promise<any[]> {
  const token = accessToken || (await getMightyCallAccessToken());
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  
  // Try journal requests with message type filter first (most reliable)
  const endpoints = [
    { path: '/journal/requests', params: '?type=Message&pageSize=1000&page=1', name: 'journal' },
    { path: '/messages', params: '', name: 'messages' },
    { path: '/contactcenter/messages', params: '', name: 'contactcenter' },
  ];
  
  let lastFailure: any = null;
  
  for (const ep of endpoints) {
    const url = `${baseUrl}${ep.path}${ep.params}`;
    try {
      const res = await requestWithRetry(url, { 
        method: 'GET', 
        headers: { 
          Authorization: `Bearer ${token}`, 
          'x-api-key': MIGHTYCALL_API_KEY || '', 
          Accept: 'application/json' 
        } 
      }, 1, 200);
      
      if (res.status === 404) { 
        lastFailure = { url, status: 404, endpoint: ep.name }; 
        continue; 
      }
      
      const text = await res.text();
      if (!res.ok) { 
        lastFailure = { url, status: res.status, body: text, endpoint: ep.name }; 
        continue; 
      }
      
      let json: any = null;
      try { 
        json = JSON.parse(text || 'null'); 
      } catch (e) { 
        lastFailure = { url, body: text, endpoint: ep.name }; 
        continue; 
      }
      
      // Handle different response shapes
      let list: any[] = [];
      if (ep.name === 'journal') {
        // Journal returns { requests: [...], currentPage: ... }
        list = json?.requests ?? json?.data?.requests ?? [];
        // Filter for message types
        list = list.filter((r: any) => r.type === 'Message' || r.type === 'MessageThread');
      } else {
        // Other endpoints might return different shapes
        list = json?.data ?? json?.messages ?? json?.sms ?? json?.data?.messages ?? [];
      }
      
      if (!Array.isArray(list)) { 
        lastFailure = { url, body: json, endpoint: ep.name }; 
        continue; 
      }
      
      console.log(`[MightyCall] successfully fetched ${list.length} messages from ${ep.name}`);
      return list as any[];
    } catch (e: any) {
      lastFailure = { url, message: e?.message ?? String(e), endpoint: ep.name };
      continue;
    }
  }
  
  console.error('[MightyCall] could not find working SMS endpoint', lastFailure);
  return [];
}

/**
 * Sync SMS messages into DB (tries `mightycall_sms_messages`, falls back to `sms_logs`).
 * Handles both journal message entries and direct SMS messages.
 */
export async function syncMightyCallSMS(supabaseAdminClient: any, orgId: string, overrideCreds?: { clientId?: string; clientSecret?: string }): Promise<{ smsSynced: number }> {
  const token = await getMightyCallAccessToken(overrideCreds);
  const smsList = await fetchMightyCallSMS(token);
  let smsSynced = 0;
  if (smsList.length === 0) return { smsSynced };

  // Handle both journal message format and direct message format
  const rows = smsList.map((m: any) => {
    // From journal: client.address, businessNumber.number, text/textModel
    // From messages API: from, to, text/body
    let from = m.from ?? m.from_number ?? m.client?.address ?? null;
    let to = m.to ?? m.to_number ?? m.businessNumber?.number ?? null;
    let messageText = m.text ?? m.body ?? m.textModel?.text ?? null;
    let messageId = m.id ?? m.messageId ?? null;
    let timestamp = m.sent_at ?? m.timestamp ?? m.sentAt ?? m.created ?? m.dateTimeUtc ?? new Date().toISOString();
    
    return {
      org_id: orgId,
      external_id: messageId,
      from_number: from,
      to_number: to,
      message_text: messageText,
      status: m.status ?? 'received',
      sent_at: timestamp,
      metadata: m
    };
  });

  // Try upsert to mightycall_sms_messages then fallback
  const { error } = await supabaseAdminClient.from('mightycall_sms_messages').upsert(rows, { onConflict: 'org_id,external_id' });
  if (!error) { smsSynced = rows.length; return { smsSynced }; }

  console.warn('[MightyCall SMS] mightycall_sms_messages upsert failed, falling back to sms_logs:', error.message || error);
  const { error: fallbackErr } = await supabaseAdminClient.from('sms_logs').upsert(rows.map(r=>({ org_id: r.org_id, from_number: r.from_number, to_numbers: r.to_number, message_text: r.message_text, direction: 'inbound', status: r.status, sent_at: r.sent_at, metadata: r.metadata })), { onConflict: 'org_id,from_number,sent_at' });
  if (!fallbackErr) smsSynced = rows.length; else console.warn('[MightyCall SMS] sms_logs fallback failed', fallbackErr);
  return { smsSynced };
}

/**
 * Sync voicemails into the database.
 */
export async function syncMightyCallVoicemails(supabaseAdminClient: any, orgId: string): Promise<{ voicemailsSynced: number }> {
  const token = await getMightyCallAccessToken();
  const voicemails = await fetchMightyCallVoicemails(token);

  let voicemailsSynced = 0;

  if (voicemails.length > 0) {
    const voicemailRows = voicemails.map((v: any) => ({
      org_id: orgId,
      external_id: v.id ?? v.voicemailId,
      from_number: v.from,
      to_number: v.to,
      duration_seconds: v.duration,
      message_date: v.dateTimeUtc ?? v.timestamp,
      status: v.status ?? 'new',
      transcription: v.transcription ?? null,
      metadata: v
    }));

    const { error } = await supabaseAdminClient
      .from('voicemail_logs')
      .upsert(voicemailRows, { onConflict: 'org_id,external_id' });

    if (!error) voicemailsSynced = voicemailRows.length;
    else console.warn('[MightyCall] voicemail sync error', error);
  }

  return { voicemailsSynced };
}

/**
 * Sync call history into the database.
 */
export async function syncMightyCallCallHistory(supabaseAdminClient: any, orgId: string, filters?: any): Promise<{ callsSynced: number }> {
  const token = await getMightyCallAccessToken();
  const calls = await fetchMightyCallCalls(token, filters);

  let callsSynced = 0;

  // Always log fetched calls count so we can diagnose why zero rows are being synced
  try {
    console.log('[MightyCall sync] fetched calls count:', Array.isArray(calls) ? calls.length : 0);
    if (Array.isArray(calls) && calls.length > 0) {
      console.log('[MightyCall sync] calls sample:', JSON.stringify(calls.slice(0, 3), null, 2));
    }
  } catch (e) {
    console.warn('[MightyCall sync] failed to stringify calls sample', e);
  }

  if (calls.length > 0) {
    const callRows = calls.map((c: any) => ({
      org_id: orgId,
      from_number: c.from ?? c.from_number,
      to_number: c.to ?? c.to_number,
      status: c.status ?? c.callStatus,
      duration_seconds: c.duration ?? 0,
      started_at: c.dateTimeUtc ?? c.timestamp ?? new Date().toISOString(),
      ended_at: c.endedAt ?? c.ended_at ?? null,
      created_at: new Date().toISOString()
    }));

    const { error } = await supabaseAdminClient
      .from('calls')
      .insert(callRows)
      .select();

    if (!error) callsSynced = callRows.length;
    else console.warn('[MightyCall] call history insert error', error);
  }

  return { callsSynced };
}

/**
 * Sync SMS messages into the database.
 */
export async function syncSMSLog(supabaseAdminClient: any, orgId: string, message: any): Promise<{ smsSynced: boolean }> {
  try {
    const { error } = await supabaseAdminClient
      .from('sms_logs')
      .insert({
        org_id: orgId,
        from_number: message.from,
        to_numbers: message.to,
        message_text: message.text,
        direction: message.direction ?? 'outbound',
        status: message.status ?? 'sent',
        sent_at: new Date().toISOString(),
        metadata: message
      });

    if (error) {
      console.warn('[SMS Log] error', error);
      return { smsSynced: false };
    }
    return { smsSynced: true };
  } catch (err) {
    console.warn('[SMS Log] sync error', err);
    return { smsSynced: false };
  }
}

/**
 * Sync contacts into the database.
 */
export async function syncMightyCallContacts(supabaseAdminClient: any, orgId: string): Promise<{ contactsSynced: number }> {
  const token = await getMightyCallAccessToken();
  const contacts = await fetchMightyCallContacts(token);

  let contactsSynced = 0;

  if (contacts.length > 0) {
    const contactRows = contacts.map((c: any) => ({
      org_id: orgId,
      external_id: c.id ?? c.contactId,
      first_name: c.firstName ?? c.first_name ?? '',
      last_name: c.lastName ?? c.last_name ?? '',
      email: c.email ?? null,
      phone: c.phone ?? c.phoneNumber ?? null,
      company: c.company ?? null,
      metadata: c
    }));

    const { error } = await supabaseAdminClient
      .from('contact_events')
      .upsert(contactRows, { onConflict: 'org_id,external_id' });

    if (!error) contactsSynced = contactRows.length;
    else console.warn('[MightyCall] contacts sync error', error);
  }

  return { contactsSynced };
}

/**
 * Sync reports into the database.
 * Returns counts of inserted/updated records.
 */
export async function syncMightyCallReports(supabaseAdminClient: any, orgId: string, phoneNumberIds: string[], startDate: string, endDate: string, overrideCreds?: { clientId?: string; clientSecret?: string }): Promise<{ reportsSynced: number, recordingsSynced: number }> {
  const token = await getMightyCallAccessToken(overrideCreds);

  // Fetch reports and recordings
  const [reports, recordings] = await Promise.all([
    fetchMightyCallReports(token, phoneNumberIds, startDate, endDate),
    fetchMightyCallRecordings(token, phoneNumberIds, startDate, endDate)
  ]);

  let reportsSynced = 0;
  let recordingsSynced = 0;

  // Sync reports - journal entries are aggregated per day/phone
  if (reports.length > 0) {
    // Aggregate journal entries into daily reports
    const reportMap = new Map<string, any>();
    
    for (const entry of reports) {
      if (entry.type !== 'Call') continue;
      
      const businessNum = entry.businessNumber?.number || entry.to || 'unknown';
      const dateKey = new Date(entry.created || entry.dateTimeUtc || new Date()).toISOString().split('T')[0];
      const key = `${businessNum}:${dateKey}`;
      
      if (!reportMap.has(key)) {
        reportMap.set(key, {
          phone_number: businessNum,
          report_date: dateKey,
          calls_count: 0,
          answered_count: 0,
          missed_count: 0,
          total_duration: 0
        });
      }
      
      const report = reportMap.get(key)!;
      report.calls_count += 1;
      
      if (entry.state === 'Connected' || entry.state === 'connected') {
        report.answered_count += 1;
      } else if (entry.state === 'Missed' || entry.state === 'missed') {
        report.missed_count += 1;
      }
      
      if (entry.duration) {
        const duration = typeof entry.duration === 'string' ? parseInt(entry.duration, 10) : entry.duration;
        report.total_duration += isNaN(duration) ? 0 : duration;
      }
    }
    
    const reportRows = Array.from(reportMap.values()).map((r: any) => ({
      org_id: orgId,
      phone_number_id: null,
      report_type: 'calls',
      report_date: r.report_date,
      data: {
        calls_count: r.calls_count,
        answered_count: r.answered_count,
        missed_count: r.missed_count,
        answer_rate: r.calls_count > 0 ? (r.answered_count / r.calls_count) * 100 : 0,
        total_duration: r.total_duration,
        phone_number: r.phone_number
      }
    }));

    if (reportRows.length > 0) {
      const { error: reportError } = await supabaseAdminClient
        .from('mightycall_reports')
        .upsert(reportRows, { onConflict: 'org_id,report_date,report_type' });

      if (reportError) {
        console.warn('[MightyCall sync reports] error', reportError);
      } else {
        reportsSynced = reportRows.length;
      }
    }
  }

  // Sync recordings
  if (recordings.length > 0) {
    const recordingRows = recordings.map((r: any) => ({
      org_id: orgId,
      phone_number_id: null,
      call_id: r.callId || r.id,
      recording_url: r.recordingUrl,
      duration_seconds: r.duration,
      recording_date: r.date,
      metadata: r.metadata || {}
    }));

    const { error: recordingError } = await supabaseAdminClient
      .from('mightycall_recordings')
      .upsert(recordingRows, { onConflict: 'org_id,call_id' });

    if (recordingError) {
      console.warn('[MightyCall sync recordings] error', recordingError);
    } else {
      recordingsSynced = recordingRows.length;
    }
  }

  // Fallback: if upstream reports empty, synthesize from call history
  if ((reports.length === 0) ) {
    try {
      const calls = await fetchMightyCallCalls(token, { dateStart: startDate, dateEnd: endDate, limit: 5000 });
      if (Array.isArray(calls) && calls.length > 0) {
        // Load org phone numbers to map numbers->ids
        const { data: pnData, error: pnErr } = await supabaseAdminClient
          .from('phone_numbers')
          .select('id,number,number_digits')
          .eq('org_id', orgId);
        const phoneMapByDigits: Record<string, string> = {};
        const phoneMapByNumber: Record<string, string> = {};
        if (!pnErr && Array.isArray(pnData)) {
          for (const p of pnData) {
            if (p.number_digits) phoneMapByDigits[p.number_digits] = p.id;
            if (p.number) phoneMapByNumber[p.number] = p.id;
          }
        }

        // Aggregate per phone
        const agg: Record<string, any> = {};
        const recordingRows: any[] = [];
        for (const c of calls) {
          const toDigits = (c.to || c.to_number || '') .replace ? (c.to || c.to_number || '').replace(/\D/g,'') : String((c.to || c.to_number || '')).replace(/\D/g,'');
          const fromDigits = (c.from || c.from_number || '') .replace ? (c.from || c.from_number || '').replace(/\D/g,'') : String((c.from || c.from_number || '')).replace(/\D/g,'');
          const keyDigits = phoneMapByDigits[toDigits] ? toDigits : (phoneMapByDigits[fromDigits] ? fromDigits : (toDigits || fromDigits));
          const phoneId = phoneMapByDigits[keyDigits] || phoneMapByNumber[c.to] || phoneMapByNumber[c.from] || null;
          const aggKey = phoneId || keyDigits || 'unknown';
          if (!agg[aggKey]) agg[aggKey] = { calls_count:0, answered_count:0, missed_count:0, sum_handle:0, handle_count:0, sum_speed:0, speed_count:0 };
          const ent = agg[aggKey];
          ent.calls_count += 1;
          const st = String((c.status || c.callStatus || '')).toLowerCase();
          if (st === 'answered' || st === 'completed') {
            ent.answered_count += 1;
            const duration = (c.duration != null) ? Number(c.duration) : (c.ended_at && c.answered_at ? (new Date(c.ended_at).getTime()-new Date(c.answered_at).getTime())/1000 : 0);
            if (duration > 0) { ent.sum_handle += duration; ent.handle_count += 1; }
            if (c.answered_at && c.started_at) {
              const speed = (new Date(c.answered_at).getTime() - new Date(c.started_at).getTime())/1000;
              if (speed >= 0) { ent.sum_speed += speed; ent.speed_count += 1; }
            }
          } else if (st === 'missed') {
            ent.missed_count += 1;
          }

          // recording extraction
          const recordingUrl = c.recordingUrl || c.recording_url || c.recordingUrlRaw || null;
          if (recordingUrl) {
            recordingRows.push({ org_id: orgId, phone_number_id: phoneId, call_id: c.id || c.callId || null, recording_url: recordingUrl, duration_seconds: c.duration ?? null, recording_date: c.dateTimeUtc ?? c.timestamp ?? c.recording_date ?? null, metadata: c });
          }
        }

        // Upsert synthesized report rows
        const reportRows: any[] = [];
        for (const k of Object.keys(agg)) {
          const a = agg[k];
          const calls_count = a.calls_count;
          const answered_count = a.answered_count;
          const missed_count = a.missed_count;
          const answer_rate = calls_count === 0 ? 0 : Math.round((answered_count/calls_count) * 10000)/100;
          const avg_handle_seconds = a.handle_count > 0 ? Math.round(a.sum_handle / a.handle_count) : 0;
          const avg_speed_seconds = a.speed_count > 0 ? Math.round(a.sum_speed / a.speed_count) : 0;
          reportRows.push({ org_id: orgId, phone_number_id: pnData && pnData.find((p:any)=>p.id===k) ? k : null, report_type: 'calls', report_date: startDate, data: { calls_count, answered_count, missed_count, answer_rate, avg_handle_seconds, avg_speed_seconds } });
        }

        if (reportRows.length > 0) {
          const { error: rrErr } = await supabaseAdminClient.from('mightycall_reports').upsert(reportRows, { onConflict: 'org_id,phone_number_id,report_type,report_date' });
          if (rrErr) console.warn('[MightyCall synth reports] upsert error', rrErr);
          else reportsSynced += reportRows.length;
        }

        if (recordingRows.length > 0) {
          const { error: recErr } = await supabaseAdminClient.from('mightycall_recordings').upsert(recordingRows, { onConflict: 'org_id,call_id' });
          if (recErr) console.warn('[MightyCall synth recordings] upsert error', recErr);
          else recordingsSynced += recordingRows.length;
        }
      }
    } catch (e) {
      console.warn('[MightyCall synth fallback] failed:', e);
    }
  }

  return { reportsSynced, recordingsSynced };
}

/**
 * Sync only recordings into the database.
 * Returns counts of inserted/updated records.
 */
export async function syncMightyCallRecordings(supabaseAdminClient: any, orgId: string, phoneNumberIds: string[], startDate: string, endDate: string, overrideCreds?: { clientId?: string; clientSecret?: string }): Promise<{ recordingsSynced: number }> {
  const token = await getMightyCallAccessToken(overrideCreds);

  // Fetch recordings
  const recordings = await fetchMightyCallRecordings(token, phoneNumberIds, startDate, endDate);

  let recordingsSynced = 0;

  // Sync recordings
  if (recordings.length > 0) {
    const recordingRows = recordings.map((r: any) => ({
      org_id: orgId,
      phone_number_id: r.phoneNumberId,
      call_id: r.callId,
      recording_url: r.recordingUrl,
      duration_seconds: r.duration,
      recording_date: r.date,
      metadata: r.metadata || {}
    }));

    const { error: recordingError } = await supabaseAdminClient
      .from('mightycall_recordings')
      .upsert(recordingRows, { onConflict: 'org_id,call_id' });

    if (recordingError) {
      console.warn('[MightyCall sync recordings] error', recordingError);
    } else {
      recordingsSynced = recordingRows.length;
    }
  }

  return { recordingsSynced };
}
