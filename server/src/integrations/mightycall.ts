export async function syncMightyCallVoicemails(
  supabaseAdminClient: any,
  orgId: string,
  overrideCreds?: any
): Promise<{ voicemailsSynced: number }> {
  try {
    const token = await getMightyCallAccessToken(overrideCreds);
    const apiKeyOverride = overrideCreds?.clientId || undefined;
    const voicemails = await fetchMightyCallVoicemails(token, apiKeyOverride).catch(() => []);

    const phoneLookup: Record<string, string> = {};
    try {
      const { data: phones } = await supabaseAdminClient
        .from('phone_numbers')
        .select('id, number, number_digits')
        .eq('org_id', orgId);
      for (const p of phones || []) {
        const num = String((p as any).number || '').trim();
        const digits = String((p as any).number_digits || num.replace(/\D/g, ''));
        if (num) phoneLookup[num] = (p as any).id;
        if (digits) phoneLookup[digits] = (p as any).id;
      }
    } catch {}

    const rows = (Array.isArray(voicemails) ? voicemails : []).map((item: any) => {
      const fromNumber = pickPhoneText(
        item?.from_number,
        item?.from,
        item?.client?.address,
        item?.client?.number,
        item?.caller?.number,
        item?.metadata?.from_number
      );
      const toNumber = pickPhoneText(
        item?.to_number,
        item?.to,
        item?.businessNumber?.number,
        item?.recipient,
        item?.destination?.number,
        item?.metadata?.to_number
      );
      const mapNumber = String(toNumber || fromNumber || '').trim();
      const mapDigits = mapNumber.replace(/\D/g, '');
      return {
        org_id: orgId,
        phone_number_id: phoneLookup[mapNumber] || phoneLookup[mapDigits] || null,
        external_id: String(item?.id || item?.requestGuid || item?.external_id || item?.audio_url || ''),
        from_number: fromNumber,
        to_number: toNumber,
        audio_url: item?.audio_url || null,
        transcription: item?.transcription || null,
        duration_seconds: Number(item?.duration_seconds ?? item?.duration ?? 0) || null,
        message_date: item?.message_date || item?.created || new Date().toISOString(),
        metadata: item?.metadata || item
      };
    }).filter((row: any) => !!row.external_id);

    if (rows.length === 0) return { voicemailsSynced: 0 };

    const { error } = await supabaseAdminClient
      .from('voicemail_logs')
      .upsert(rows, { onConflict: 'org_id,external_id' });

    if (error) {
      console.warn('[MightyCall] voicemail insert failed:', error);
      return { voicemailsSynced: 0 };
    }
    return { voicemailsSynced: rows.length };
  } catch (err: any) {
    console.warn('[MightyCall] syncMightyCallVoicemails error:', err?.message || err);
    return { voicemailsSynced: 0 };
  }
}
import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, MIGHTYCALL_BASE_URL } from '../config/env';

async function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
async function requestWithRetry(url: string, opts: any, retries = 2, backoff = 250) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try { return await fetch(url, opts); } catch (e: any) {
      if (attempt > retries) throw e;
      await delay(backoff * attempt);
    }
  }
}

function buildUrlVariants(base: string, endpoint: string) {
  const b = (base || '').replace(/\/$/, '');
  const ep = endpoint || '';
  return [`${b}${ep}`, `${b}/api${ep}`];
}

const DEFAULT_MIGHTYCALL_HISTORY_START = '2020-01-01';

function resolveSyncDateRange(startDate?: string, endDate?: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    start: startDate || DEFAULT_MIGHTYCALL_HISTORY_START,
    end: endDate || today
  };
}

export async function getMightyCallAccessToken(override?: { clientId?: string; clientSecret?: string }): Promise<string> {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const clientId = override?.clientId || MIGHTYCALL_API_KEY || '';
  const clientSecret = override?.clientSecret || MIGHTYCALL_USER_KEY || '';
  const authEndpoints = ['/auth/token', '/oauth/token', '/auth/access_token', '/token'];
  const candidates = authEndpoints.flatMap((ep) => buildUrlVariants(base, ep));

  const formBody = new URLSearchParams();
  formBody.append('grant_type', 'client_credentials');
  formBody.append('client_id', clientId);
  formBody.append('client_secret', clientSecret);

  const requestOptions: any[] = [
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'x-api-key': clientId || '' },
      body: formBody.toString()
    },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': clientId || '' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
    },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': clientId || '', 'x-user-key': clientSecret || '' },
      body: JSON.stringify({ apiKey: clientId, userKey: clientSecret })
    },
    {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-api-key': clientId || '', 'x-user-key': clientSecret || '' }
    }
  ];

  for (const url of candidates) {
    for (const opts of requestOptions) {
      try {
        const res = await requestWithRetry(url, opts, 2, 300);
        const text = await res.text().catch(() => '');
        if (!res.ok) continue;
        let parsed: any = null;
        try { parsed = JSON.parse(text || 'null'); } catch { parsed = text; }
        const token = pickTokenFromAuthResponse(parsed);
        if (token) return token;
      } catch {
        continue;
      }
    }
  }
  throw new Error('Failed to obtain MightyCall access token');
}

async function tryFetchJson(url: string, token?: string, apiKeyOverride?: string) {
  const res = await requestWithRetry(url, { method: 'GET', headers: { Accept: 'application/json', 'x-api-key': apiKeyOverride || MIGHTYCALL_API_KEY || '', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, 2, 300);
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, body: text };
  try { return { ok: true, status: res.status, body: JSON.parse(text || 'null') }; } catch (e) { return { ok: true, status: res.status, body: text }; }
}

function pickTokenFromAuthResponse(body: any): string | null {
  if (!body) return null;
  if (typeof body === 'string') return body || null;
  return (
    body?.access_token ||
    body?.token ||
    body?.jwt ||
    body?.data?.access_token ||
    body?.data?.token ||
    body?.result?.access_token ||
    body?.result?.token ||
    null
  );
}

export async function fetchMightyCallPhoneNumbers(accessToken: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/phonenumbers', '/phone_numbers', '/v4/phonenumbers', '/v4/phone_numbers'];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, accessToken);
      if (r.ok && r.body) {
        const list = (r.body as any)?.data?.phoneNumbers ?? (r.body as any)?.phoneNumbers ?? (r.body as any)?.data ?? [];
        if (Array.isArray(list)) return list;
      }
    }
  }
  return [];
}

export async function fetchMightyCallCalls(accessToken: string, filters?: any, apiKeyOverride?: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = filters?.fast ? ['/calls'] : ['/calls', '/api/calls', '/v4/calls', '/api/calls/list', '/journal/calls', '/call-history', '/callhistory'];
  const pageSize = Math.min(Math.max(parseInt(String(filters?.pageSize || '200'), 10) || 200, 1), 1000);
  const maxPages = Math.min(Math.max(parseInt(String(filters?.maxPages || '50'), 10) || 50, 1), 50);
  const all: any[] = [];
  const seen = new Set<string>();

  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      let skip = parseInt(String(filters?.skip || '0'), 10) || 0;
      let page = parseInt(String(filters?.page || '1'), 10) || 1;
      let success = false;

      for (let i = 0; i < maxPages; i++) {
        try {
          const params = new URLSearchParams();
          const startUtc = filters?.startUtc || (filters?.dateStart ? `${filters.dateStart}T00:00:00Z` : undefined);
          const endUtc = filters?.endUtc || (filters?.dateEnd ? `${filters.dateEnd}T23:59:59Z` : undefined);
          if (startUtc) {
            params.append('startUtc', String(startUtc));
            params.append('from', String(startUtc));
            params.append('dateStart', String(filters?.dateStart || String(startUtc).slice(0, 10)));
            params.append('fromDate', String(filters?.dateStart || String(startUtc).slice(0, 10)));
          }
          if (endUtc) {
            params.append('endUtc', String(endUtc));
            params.append('to', String(endUtc));
            params.append('dateEnd', String(filters?.dateEnd || String(endUtc).slice(0, 10)));
            params.append('toDate', String(filters?.dateEnd || String(endUtc).slice(0, 10)));
          }
          params.append('pageSize', String(pageSize));
          params.append('limit', String(pageSize));
          params.append('skip', String(skip));
          params.append('offset', String(skip));
          params.append('page', String(page));
          if (filters?.extension) params.append('extension', String(filters.extension));
          if (filters?.callFilter) params.append('callFilter', String(filters.callFilter));
          if (filters?.customFilter) params.append('customFilter', String(filters.customFilter));

          const full = `${url}?${params.toString()}`;
          const r = await tryFetchJson(full, accessToken, apiKeyOverride);
          if (!r.ok || !r.body) break;

          const body: any = r.body;
          const list = body?.data?.calls ?? body?.calls ?? body?.data?.items ?? body?.items ?? body?.rows ?? body?.data ?? [];
          if (!Array.isArray(list) || list.length === 0) {
            success = true;
            break;
          }

          for (const row of list) {
            const key = String(row?.id || row?.callId || `${row?.from || row?.from_number || ''}:${row?.to || row?.to_number || ''}:${row?.dateTimeUtc || row?.started_at || ''}`);
            if (!seen.has(key)) {
              seen.add(key);
              all.push(row);
            }
          }

          success = true;
          const hasMore = body?.hasMore === true || body?.data?.hasMore === true;
          if (list.length < pageSize && !hasMore) break;
          skip += list.length;
          page += 1;
        } catch {
          break;
        }
      }

      if (success && (all.length > 0 || filters?.returnOnFirstSuccess)) return all;
    }
  }
  return all;
}

export async function fetchMightyCallJournalRequests(accessToken: string, params: Record<string,string>, apiKeyOverride?: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const ep = '/journal/requests';
  const pageSize = Math.min(Math.max(parseInt(String(params.pageSize || '200'), 10) || 200, 1), 1000);
  const maxPages = 50;
  const all: any[] = [];
  const seen = new Set<string>();

  for (const url of buildUrlVariants(base, ep)) {
    let page = parseInt(String(params.page || '1'), 10) || 1;
    let success = false;

    for (let i = 0; i < maxPages; i++) {
      const qp = new URLSearchParams(params);
      qp.set('page', String(page));
      qp.set('pageSize', String(pageSize));
      if (params?.from) qp.set('dateFrom', params.from);
      if (params?.to) qp.set('dateTo', params.to);
      if (params?.type) qp.set('requestType', params.type);

      const full = `${url}?${qp.toString()}`;
      const r = await tryFetchJson(full, accessToken, apiKeyOverride);
      if (!r.ok || !r.body) break;

      const body: any = r.body;
      const list = body?.requests ?? body?.data?.requests ?? body?.data ?? [];
      if (!Array.isArray(list) || list.length === 0) {
        success = true;
        break;
      }

      for (const row of list) {
        const key = String(row?.id || row?.requestGuid || `${row?.created || ''}:${row?.type || ''}:${row?.textModel?.text || ''}`);
        if (!seen.has(key)) {
          seen.add(key);
          all.push(row);
        }
      }

      success = true;
      const hasMore = body?.hasMore === true || body?.data?.hasMore === true;
      if (list.length < pageSize && !hasMore) break;
      page += 1;
    }

    if (success && all.length > 0) return all;
  }
  return all;
}

export async function fetchMightyCallContactCenterCommunications(accessToken: string, params: Record<string,string>, apiKeyOverride?: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const ep = '/contactCenter/communications';
  const pageSize = Math.min(Math.max(parseInt(String(params.pageSize || '200'), 10) || 200, 1), 1000);
  const maxPages = 20;
  const all: any[] = [];
  const seen = new Set<string>();

  for (const url of buildUrlVariants(base, ep)) {
    let page = parseInt(String(params.page || '1'), 10) || 1;
    let success = false;

    for (let i = 0; i < maxPages; i++) {
      const qp = new URLSearchParams(params);
      qp.set('page', String(page));
      qp.set('pageSize', String(pageSize));
      qp.set('showUsers', String(params.showUsers || 'true'));
      qp.set('resolveContacts', String(params.resolveContacts || 'false'));
      if (params?.from) {
        qp.set('from', params.from);
        qp.set('earliest', params.from);
      }
      if (params?.to) {
        qp.set('to', params.to);
        qp.set('latest', params.to);
      }
      if (params?.type) qp.set('type', params.type);
      if (params?.state) qp.set('state', params.state);
      if (params?.origin) qp.set('origin', params.origin);

      const r = await tryFetchJson(`${url}?${qp.toString()}`, accessToken, apiKeyOverride);
      if (!r.ok || !r.body) break;

      const body: any = r.body;
      const list =
        body?.data?.requests ??
        body?.data?.communications ??
        body?.requests ??
        body?.communications ??
        body?.data?.items ??
        body?.items ??
        body?.data ??
        [];
      if (!Array.isArray(list) || list.length === 0) {
        success = true;
        break;
      }

      for (const row of list) {
        const key = String(row?.id || row?.requestGuid || row?.guid || `${row?.created || ''}:${row?.agent?.extension || ''}:${row?.client?.address || ''}`);
        if (!seen.has(key)) {
          seen.add(key);
          all.push(row);
        }
      }

      success = true;
      const hasMore = body?.hasMore === true || body?.data?.hasMore === true;
      if (list.length < pageSize && !hasMore) break;
      page += 1;
    }

    if (success && all.length > 0) return all;
  }

  return all;
}

function pickPhoneText(...values: any[]): string | null {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string') {
      const next = value.trim();
      if (next) return next;
      continue;
    }
    if (typeof value === 'object') {
      const nested = pickPhoneText(
        value.number,
        value.phone,
        value.address,
        value.phoneNumber,
        value.businessNumber,
        value.client?.address,
        value.client?.number,
        value.caller?.number,
        value.destination?.number
      );
      if (nested) return nested;
    }
  }
  return null;
}

export async function fetchMightyCallRecordings(
  accessToken: string,
  phoneNumberIds: string[] = [],
  startDate?: string,
  endDate?: string,
  apiKeyOverride?: string
) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const recordings: any[] = [];
  const seen = new Set<string>();
  const addRecording = (row: any) => {
    const normalized = {
      id: row?.id || row?.recordingId || row?.externalId || row?.callId || null,
      callId: row?.callId || row?.call_id || row?.id || row?.externalId || null,
      recordingUrl: row?.recordingUrl || row?.recording_url || row?.uri || row?.link || row?.downloadUrl || row?.fileName || null,
      duration: row?.duration ?? row?.durationSeconds ?? row?.lengthSeconds ?? null,
      date: row?.recordingDate || row?.recordedAt || row?.date || row?.created || row?.createdAt || null,
      metadata: row?.metadata || row
    };
    if (!normalized.recordingUrl && !normalized.callId && !normalized.id) return;
    const key = String(normalized.callId || normalized.id || normalized.recordingUrl || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    recordings.push(normalized);
  };

  const directEndpoints = ['/recordings', '/call-recordings', '/callrecordings', '/v4/recordings', '/v4/call-recordings'];
  const pageSize = 200;
  const maxPages = 50;
  for (const ep of directEndpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      let page = 1;
      for (let i = 0; i < maxPages; i++) {
        const qp = new URLSearchParams();
        if (startDate) {
          qp.set('from', `${startDate}T00:00:00Z`);
          qp.set('startUtc', `${startDate}T00:00:00Z`);
          qp.set('dateStart', startDate);
        }
        if (endDate) {
          qp.set('to', `${endDate}T23:59:59Z`);
          qp.set('endUtc', `${endDate}T23:59:59Z`);
          qp.set('dateEnd', endDate);
        }
        qp.set('page', String(page));
        qp.set('pageSize', String(pageSize));
        qp.set('limit', String(pageSize));
        const r = await tryFetchJson(`${url}?${qp.toString()}`, accessToken, apiKeyOverride);
        if (!r.ok || !r.body) break;
        const body: any = r.body;
        const list = body?.data?.recordings ?? body?.recordings ?? body?.data?.items ?? body?.items ?? body?.data ?? [];
        if (!Array.isArray(list) || list.length === 0) break;
        for (const row of list) addRecording(row);
        const hasMore = body?.hasMore === true || body?.data?.hasMore === true;
        if (list.length < pageSize && !hasMore) break;
        page += 1;
      }
    }
  }

  const calls = await fetchMightyCallCalls(accessToken, {
    startUtc: startDate ? `${startDate}T00:00:00Z` : undefined,
    endUtc: endDate ? `${endDate}T23:59:59Z` : undefined,
    pageSize: '1000',
    skip: '0'
  }, apiKeyOverride);
  for (const c of calls) {
    const rec =
      (c as any)?.callRecord ??
      (c as any)?.recording ??
      (c as any)?.call_record ??
      (c as any)?.callRecording ??
      null;
    if (rec && (rec.uri || rec.fileName || rec.link || rec.downloadUrl || rec.recordingUrl)) {
      addRecording({
        id: (c as any).id || (c as any).callId,
        callId: (c as any).id || (c as any).callId,
        recordingUrl: rec.uri || rec.fileName || rec.link || rec.downloadUrl || rec.recordingUrl,
        duration: (c as any).duration ?? null,
        date: (c as any).dateTimeUtc ?? (c as any).created ?? null,
        metadata: c
      });
    }
  }

  const jr = await fetchMightyCallJournalRequests(accessToken, {
    from: `${startDate}T00:00:00Z`,
    to: `${endDate}T23:59:59Z`,
    type: 'Call',
    pageSize: '1000',
    page: '1'
  }, apiKeyOverride);
  for (const r of jr) {
    const link = (r as any)?.recording?.link ?? (r as any)?.recording?.uri ?? (r as any)?.recording?.downloadUrl ?? null;
    if (link) {
      addRecording({
        id: (r as any).id,
        callId: (r as any).id,
        recordingUrl: link,
        duration: null,
        date: (r as any).created ?? null,
        metadata: r
      });
    }
  }
  return recordings;
}

export async function fetchMightyCallSMS(accessToken?: string) {
  const token = accessToken || await getMightyCallAccessToken();
  const messageTypes = ['Message', 'SMS', 'Sms'];
  const merged: any[] = [];
  const seen = new Set<string>();
  for (const t of messageTypes) {
    const list = await fetchMightyCallJournalRequests(token, { pageSize: '1000', page: '1', type: t }).catch(() => []);
    for (const row of Array.isArray(list) ? list : []) {
      const key = String(row?.id || row?.requestGuid || `${row?.created || ''}:${row?.textModel?.text || row?.text || ''}`);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(row);
      }
    }
  }
  return merged;
}

export async function fetchMightyCallContacts(accessToken?: string) {
  const token = accessToken || await getMightyCallAccessToken();
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const ep = '/contacts';
  for (const url of buildUrlVariants(base, ep)) {
    const r = await tryFetchJson(url, token);
    if (r.ok && r.body) {
      const list = (r.body as any)?.data ?? (r.body as any)?.contacts ?? (r.body as any) ?? [];
      if (Array.isArray(list)) return list;
    }
  }
  return [];
}

function normalizeExtensionValue(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits && digits.length <= 6) return digits;
  if (/^\d{1,6}$/.test(raw)) return raw;
  return '';
}

function pickDisplayName(value: any): string | null {
  const joinedNames = [
    [value?.firstName, value?.lastName],
    [value?.first_name, value?.last_name],
    [value?.user?.firstName, value?.user?.lastName],
    [value?.user?.first_name, value?.user?.last_name],
    [value?.member?.firstName, value?.member?.lastName],
    [value?.member?.first_name, value?.member?.last_name],
  ]
    .map((parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ').trim())
    .find(Boolean);
  if (joinedNames) return joinedNames;

  const candidates = [
    value?.displayName,
    value?.display_name,
    value?.name,
    value?.fullName,
    value?.full_name,
    value?.profile?.displayName,
    value?.profile?.display_name,
    value?.profile?.name,
    value?.profile?.fullName,
    value?.profile?.full_name,
    value?.user?.displayName,
    value?.user?.display_name,
    value?.user?.name,
    value?.user?.fullName,
    value?.user?.full_name,
    value?.member?.displayName,
    value?.member?.display_name,
    value?.member?.name,
    value?.member?.fullName,
    value?.member?.full_name,
    value?.contact?.name
  ];
  for (const candidate of candidates) {
    const next = String(candidate || '').trim();
    if (next) return next;
  }
  return null;
}

function collectExtensionCandidatesFromPayload(input: any, depth = 0): string[] {
  if (depth > 4 || input == null) return [];
  const found = new Set<string>();

  if (Array.isArray(input)) {
    for (const item of input) {
      for (const ext of collectExtensionCandidatesFromPayload(item, depth + 1)) found.add(ext);
    }
    return Array.from(found);
  }

  if (typeof input !== 'object') {
    const ext = normalizeExtensionValue(input);
    return ext ? [ext] : [];
  }

  const keys = Object.keys(input as Record<string, any>);
  for (const key of keys) {
    const lower = key.toLowerCase();
    const value = (input as any)[key];

    if (
      lower === 'extension' ||
      lower === 'ext' ||
      lower === 'extensionid' ||
      lower === 'extensionnumber' ||
      lower === 'internalnumber' ||
      lower === 'shortnumber' ||
      lower === 'number'
    ) {
      const ext = normalizeExtensionValue(value);
      if (ext) found.add(ext);
    }

    if (
      lower.includes('extension') ||
      lower.includes('internal') ||
      lower.includes('short') ||
      lower === 'caller' ||
      lower === 'called' ||
      lower === 'participants' ||
      lower === 'users' ||
      lower === 'user' ||
      lower === 'member' ||
      lower === 'agent'
    ) {
      for (const ext of collectExtensionCandidatesFromPayload(value, depth + 1)) found.add(ext);
    }
  }

  return Array.from(found);
}

function collectExtensionRows(list: any[]): Array<{ id: string | null; extension: string; display_name: string | null; metadata: any }> {
  const rows = new Map<string, { id: string | null; extension: string; display_name: string | null; metadata: any }>();
  for (const item of Array.isArray(list) ? list : []) {
    const candidates = collectExtensionCandidatesFromPayload(item);
    const displayName = pickDisplayName(item);
    for (const extension of candidates) {
      if (!extension) continue;
      const existing = rows.get(extension);
      if (!existing) {
        rows.set(extension, {
          id: item?.id || item?.externalId || item?.extensionId || item?.userId || item?.memberId || null,
          extension,
          display_name: displayName,
          metadata: item
        });
        continue;
      }
      if (!existing.display_name && displayName) {
        rows.set(extension, { ...existing, display_name: displayName });
      }
    }
  }
  return Array.from(rows.values());
}

function parseMightyCallTimestampMs(value: any): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMightyCallStartedAt(call: any): string | null {
  return (
    call?.dateTimeUtc ||
    call?.startedAt ||
    call?.started_at ||
    call?.startTime ||
    call?.start_time ||
    call?.createdAt ||
    call?.created_at ||
    call?.created ||
    call?.time ||
    null
  );
}

function extractMightyCallEndedAt(call: any): string | null {
  return (
    call?.endedAt ||
    call?.ended_at ||
    call?.endTime ||
    call?.end_time ||
    call?.completedAt ||
    call?.completed_at ||
    call?.finishedAt ||
    call?.finished_at ||
    call?.ended ||
    null
  );
}

function parseMightyCallDurationSeconds(value: any): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    if (parsed >= 10000) return parsed / 1000;
    return parsed;
  }
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
    return parts.reduce((total, part) => (total * 60) + part, 0);
  }
  return null;
}

function extractMightyCallDurationSeconds(call: any): number | null {
  return parseMightyCallDurationSeconds(
    call?.duration_seconds ??
    call?.durationSeconds ??
    call?.duration ??
    call?.callDuration ??
    call?.talkTime ??
    call?.talk_time
  );
}

function extractMightyCallStatusCandidates(call: any): string[] {
  const values = [
    call?.status,
    call?.state,
    call?.callStatus,
    call?.call_status,
    call?.availability,
    call?.presence,
    call?.result,
    call?.caller?.status,
    call?.caller?.state,
    call?.agent?.status,
    call?.agent?.state,
    call?.user?.status,
    call?.user?.state,
  ];
  for (const row of Array.isArray(call?.called) ? call.called : []) {
    values.push(row?.status, row?.state, row?.callStatus, row?.call_status);
  }
  for (const row of Array.isArray(call?.participants) ? call.participants : []) {
    values.push(row?.status, row?.state, row?.callStatus, row?.call_status);
  }
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function isMightyCallTerminalStatus(status: any): boolean {
  const normalized = String(status || '').toLowerCase().trim();
  if (!normalized) return false;
  return [
    'completed',
    'ended',
    'end',
    'missed',
    'failed',
    'canceled',
    'cancelled',
    'voicemail',
    'noanswer',
    'no_answer',
    'abandoned',
    'closed',
    'done',
    'idle',
    'available',
    'offline',
    'disconnected',
    'hangup',
    'hang_up',
    'wrapup',
    'wrap_up',
    'after_call',
  ].some((token) => normalized.includes(token));
}

function isMightyCallActiveStatus(status: any): boolean {
  const normalized = String(status || '').toLowerCase().trim();
  if (!normalized || isMightyCallTerminalStatus(normalized)) return false;
  return ['ring', 'talk', 'active', 'progress', 'connect', 'answer', 'hold', 'queue', 'call'].some((token) => normalized.includes(token));
}

function participantHasConnectedSignal(participant: any): boolean {
  if (!participant || typeof participant !== 'object') return false;
  if (participant.isConnected === true || participant.connected === true || participant.is_connected === true) return true;
  return extractMightyCallStatusCandidates(participant).some((status) => isMightyCallActiveStatus(status));
}

function callHasConnectedParticipantForExtension(call: any, normalizedExtension: string): boolean {
  const participants = [
    call?.caller,
    call?.agent,
    call?.user,
    ...(Array.isArray(call?.called) ? call.called : []),
    ...(Array.isArray(call?.participants) ? call.participants : []),
  ].filter(Boolean);

  return participants.some((participant) => (
    collectExtensionCandidatesFromPayload(participant).includes(normalizedExtension) &&
    participantHasConnectedSignal(participant)
  ));
}

function isMightyCallLiveCallForExtension(call: any, normalizedExtension: string, nowMs = Date.now()): boolean {
  if (!call || typeof call !== 'object') return false;
  const extensionCandidates = collectExtensionCandidatesFromPayload(call);
  const queryScopedExtension = normalizeExtensionValue(
    call?.queryExtension ||
    call?.query_extension ||
    call?.extension ||
    call?.agent_extension ||
    null
  );
  const hasExtensionEvidence = extensionCandidates.includes(normalizedExtension) || queryScopedExtension === normalizedExtension;
  if (!hasExtensionEvidence && extensionCandidates.length > 0) return false;

  const statuses = extractMightyCallStatusCandidates(call);
  if (statuses.some((status) => isMightyCallTerminalStatus(status))) return false;
  if (String(extractMightyCallEndedAt(call) || '').trim()) return false;

  const startedAt = extractMightyCallStartedAt(call);
  const startedMs = parseMightyCallTimestampMs(startedAt);
  const ageMs = startedMs == null ? null : nowMs - startedMs;
  if (ageMs != null && (ageMs < -(5 * 60 * 1000) || ageMs > (48 * 60 * 60 * 1000))) return false;

  const durationSeconds = extractMightyCallDurationSeconds(call);
  if (durationSeconds != null && startedMs != null) {
    const endedByDurationMs = startedMs + (durationSeconds * 1000);
    if (endedByDurationMs < (nowMs - 15000)) return false;
  }

  if (callHasConnectedParticipantForExtension(call, normalizedExtension)) return true;

  const hasActiveStatus = statuses.some((status) => isMightyCallActiveStatus(status));
  if (!hasActiveStatus) return false;

  return true;
}

export async function fetchMightyCallLiveCallByExtension(extension: string, accessToken: string, apiKeyOverride?: string) {
  const normalized = normalizeExtensionValue(extension);
  if (!normalized) return null;

  const now = Date.now();
  const startUtc = new Date(now - (20 * 60 * 1000)).toISOString();
  const endUtc = new Date(now + (5 * 60 * 1000)).toISOString();
  let token = accessToken;
  if (apiKeyOverride) {
    try {
      token = await getMightyCallAccessToken({
        clientId: apiKeyOverride,
        clientSecret: normalized,
      });
    } catch {}
  }
  const rows = await fetchMightyCallCalls(token, {
    extension: normalized,
    startUtc,
    endUtc,
    pageSize: '25',
    maxPages: '1',
    skip: '0',
    fast: true,
    returnOnFirstSuccess: true,
  }, apiKeyOverride).catch(() => []);

  const seen = new Set<string>();
  const candidates = (Array.isArray(rows) ? rows : []).filter((call) => {
    const scopedCall = {
      ...(call || {}),
      queryExtension: normalized,
      query_extension: normalized,
      extension: normalizeExtensionValue((call as any)?.extension || normalized),
      agent_extension: normalizeExtensionValue((call as any)?.agent_extension || normalized),
    };
    const key = String(call?.id || call?.callId || call?.requestGuid || `${extractMightyCallStartedAt(call) || ''}:${JSON.stringify(call?.called || '')}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return isMightyCallLiveCallForExtension(scopedCall, normalized, now);
  });

  candidates.sort((a, b) => {
    const bTime = parseMightyCallTimestampMs(extractMightyCallStartedAt(b)) || 0;
    const aTime = parseMightyCallTimestampMs(extractMightyCallStartedAt(a)) || 0;
    return bTime - aTime;
  });

  const currentCall = candidates[0] || null;
  return currentCall
    ? {
        extension: normalized,
        status: extractMightyCallStatusCandidates(currentCall).find((status) => isMightyCallActiveStatus(status)) || 'Connected',
        onCall: true,
        currentCall,
        sourceEndpoint: '/calls?extension&callFilter=Connected',
      }
    : null;
}

export async function fetchMightyCallProfileByExtension(extension: string, accessToken?: string, apiKeyOverride?: string) {
  const normalized = normalizeExtensionValue(extension);
  if (!normalized) return null;
  const token = accessToken || await getMightyCallAccessToken();
  if (apiKeyOverride) {
    try {
      const extensionToken = await getMightyCallAccessToken({
        clientId: apiKeyOverride,
        clientSecret: normalized,
      });
      const profile = await fetchMightyCallOwnProfile(extensionToken, apiKeyOverride);
      const resolvedExtension = normalizeExtensionValue(
        profile?.extension ||
        profile?.ext ||
        profile?.extensionNumber ||
        profile?.extension_number ||
        profile?.internalNumber ||
        profile?.shortNumber ||
        normalized
      );
      if (profile && (!resolvedExtension || resolvedExtension === normalized)) {
        return {
          id: profile?.id || profile?.userId || profile?.memberId || null,
          extension: resolvedExtension || normalized,
          display_name: pickDisplayName(profile) || profile?.email || profile?.login || null,
          email: profile?.email || profile?.login || null,
          role: profile?.role || null,
          metadata: profile
        };
      }
    } catch {}
  }

  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = [`/profile/${encodeURIComponent(normalized)}`, `/v4/profile/${encodeURIComponent(normalized)}`];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, token, apiKeyOverride);
      if (!r.ok || !r.body) continue;
      const body: any = r.body;
      const data = body?.data ?? body;
      const resolvedExtension = normalizeExtensionValue(data?.extension || normalized);
      if (!resolvedExtension) continue;
      return {
        id: data?.id || data?.userId || data?.memberId || null,
        extension: resolvedExtension,
        display_name: pickDisplayName(data) || data?.email || data?.login || null,
        email: data?.email || data?.login || null,
        role: data?.role || null,
        metadata: data
      };
    }
  }
  return null;
}

export async function fetchMightyCallOwnProfile(accessToken: string, apiKeyOverride?: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = [
    '/profile',
    '/v4/profile',
    '/me',
    '/v4/me',
    '/user',
    '/v4/user',
    '/userinfo',
    '/v4/userinfo'
  ];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, accessToken, apiKeyOverride);
      if (!r.ok || !r.body) continue;
      const data = (r.body as any)?.data ?? r.body;
      if (!data || typeof data !== 'object') continue;
      if (Array.isArray(data)) {
        const firstObject = data.find((item) => item && typeof item === 'object');
        if (firstObject) return firstObject;
        continue;
      }
      return data;
    }
  }
  return null;
}

export async function fetchMightyCallOwnStatus(accessToken: string, apiKeyOverride?: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = [
    '/profile/status',
    '/v4/profile/status',
    '/status',
    '/profile/get-status',
    '/profile',
    '/v4/profile',
    '/me',
    '/v4/me',
    '/user',
    '/v4/user',
    '/userinfo',
    '/v4/userinfo'
  ];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, accessToken, apiKeyOverride);
      if (!r.ok || !r.body) continue;
      const body: any = r.body;
      const data = body?.data ?? body;
      if (!data || typeof data !== 'object') continue;
      if (Array.isArray(data)) {
        const firstObject = data.find((item) => item && typeof item === 'object');
        if (firstObject) return firstObject;
        continue;
      }
      return data;
    }
  }
  return null;
}

export async function fetchMightyCallProfileStatusByExtension(extension: string, accessToken: string, apiKeyOverride?: string) {
  const normalized = normalizeExtensionValue(extension);
  if (!normalized) return null;

  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  let profileStatus: any = null;
  const pickStatusPayload = (body: any) => {
    const data = body?.data ?? body;
    if (!data) return null;
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : null);
    if (rows) {
      return rows.find((item: any) => (
        item &&
        typeof item === 'object' &&
        normalizeExtensionValue(item?.extension || item?.ext || item?.extensionNumber || item?.extension_number) === normalized
      )) || rows.find((item: any) => item && typeof item === 'object') || null;
    }
    return typeof data === 'object' ? data : null;
  };
  if (apiKeyOverride) {
    try {
      const extensionToken = await getMightyCallAccessToken({
        clientId: apiKeyOverride,
        clientSecret: normalized,
      });
      const status = await fetchMightyCallOwnStatus(extensionToken, apiKeyOverride);
      if (status) return { ...status, extension: normalized, sourceEndpoint: '/profile/status as extension' };
    } catch {}
  }

  const queryEndpoints = [
    '/profile/status',
    '/profile/get-status',
    '/status',
    '/user/status',
    '/users/status',
    '/extensions/status',
  ];
  const pathEndpoints = [
    `/profile/status/${encodeURIComponent(normalized)}`,
    `/profile/get-status/${encodeURIComponent(normalized)}`,
    `/profile/${encodeURIComponent(normalized)}/status`,
    `/users/${encodeURIComponent(normalized)}/status`,
    `/extensions/${encodeURIComponent(normalized)}/status`,
    `/agents/${encodeURIComponent(normalized)}/status`,
  ];

  for (const ep of queryEndpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      for (const paramName of ['extension', 'ext', 'extensionNumber', 'extension_number']) {
        const params = new URLSearchParams();
        params.set(paramName, normalized);
        const r = await tryFetchJson(`${url}?${params.toString()}`, accessToken, apiKeyOverride);
        if (!r.ok || !r.body) continue;
        const data = pickStatusPayload(r.body);
        if (!data) continue;
        profileStatus = profileStatus || { ...data, extension: data?.extension || normalized, sourceEndpoint: `${ep}?${paramName}` };
        break;
      }
      if (profileStatus) break;
    }
    if (profileStatus) break;
  }

  if (!profileStatus) {
    for (const ep of pathEndpoints) {
      for (const url of buildUrlVariants(base, ep)) {
        const r = await tryFetchJson(url, accessToken, apiKeyOverride);
        if (!r.ok || !r.body) continue;
        const data = pickStatusPayload(r.body);
        if (!data) continue;
        profileStatus = { ...data, extension: data?.extension || normalized, sourceEndpoint: ep };
        break;
      }
      if (profileStatus) break;
    }
  }

  return profileStatus;
}

// Lightweight placeholders for extensions/voicemails
export async function fetchMightyCallExtensions(accessToken?: string, apiKeyOverride?: string) {
  const token = accessToken || await getMightyCallAccessToken();
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/extensions', '/users/extensions', '/v4/extensions', '/users', '/members', '/agents'];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, token, apiKeyOverride);
      if (!r.ok || !r.body) continue;
      const list =
        (r.body as any)?.data?.extensions ??
        (r.body as any)?.extensions ??
        (r.body as any)?.data?.users ??
        (r.body as any)?.users ??
        (r.body as any)?.data?.members ??
        (r.body as any)?.members ??
        (r.body as any)?.data?.agents ??
        (r.body as any)?.agents ??
        (r.body as any)?.data ??
        [];
      if (Array.isArray(list)) {
        const rows = collectExtensionRows(list);
        if (rows.length > 0) return rows;
      }
    }
  }
  return [];
}
export async function fetchMightyCallVoicemails(accessToken?: string, apiKeyOverride?: string) {
  const token = accessToken || await getMightyCallAccessToken();
  const rows: any[] = [];
  const seen = new Set<string>();
  const messageTypes = ['Voicemail', 'VoiceMail', 'VoicemailMessage'];

  for (const type of messageTypes) {
    const list = await fetchMightyCallJournalRequests(token, {
      pageSize: '500',
      page: '1',
      type
    }, apiKeyOverride).catch(() => []);

    for (const row of Array.isArray(list) ? list : []) {
      const audioUrl =
        row?.recording?.link ||
        row?.recording?.uri ||
        row?.recording?.downloadUrl ||
        row?.audioUrl ||
        row?.audio_url ||
        null;
      const externalId = String(row?.id || row?.requestGuid || audioUrl || '').trim();
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      rows.push({
        id: externalId,
        from_number: pickPhoneText(row?.from, row?.from_number, row?.client?.address, row?.caller?.number),
        to_number: pickPhoneText(row?.to, row?.to_number, row?.businessNumber?.number, row?.destination?.number),
        audio_url: audioUrl,
        transcription: row?.transcription || row?.textModel?.text || row?.text || null,
        duration_seconds: Number(row?.duration ?? row?.durationSeconds ?? 0) || null,
        message_date: row?.created || row?.createdAt || null,
        metadata: row
      });
    }
  }

  return rows;
}

// Sync helpers used by server scripts. These perform minimal, safe DB upserts and return counts.
export async function syncMightyCallPhoneNumbers(
  supabaseAdminClient: any,
  orgId?: string,
  phones: any[] = []
): Promise<{ synced?: number; upserted?: number }> {
  try {
    let sourcePhones = phones;
    if (!Array.isArray(sourcePhones) || sourcePhones.length === 0) {
      const token = await getMightyCallAccessToken();
      sourcePhones = await fetchMightyCallPhoneNumbers(token);
    }
    if (!Array.isArray(sourcePhones) || sourcePhones.length === 0) return { synced: 0, upserted: 0 };

    const rows = sourcePhones
      .map((p: any) => {
        const number = String(p.number || p.phone || p.businessNumber?.number || '').trim();
        if (!number) return null;
        const row: any = {
          external_id: String(p.id || p.external_id || p.externalId || number),
          number,
          label: p.label || p.name || null,
          number_digits: String(p.numberDigits || number.replace(/\D/g, '')),
          is_active: p.isEnabled == null ? true : !!p.isEnabled,
          metadata: p
        };
        if (orgId) row.org_id = orgId;
        return row;
      })
      .filter(Boolean);

    if (rows.length === 0) return { synced: 0, upserted: 0 };
    const { error, data } = await supabaseAdminClient
      .from('phone_numbers')
      .upsert(rows, { onConflict: 'external_id' })
      .select('id');
    if (error) throw error;
    const count = Array.isArray(data) ? data.length : rows.length;
    return { synced: count, upserted: count };
  } catch (e) {
    console.warn('[MightyCall] sync phone numbers failed:', (e as any)?.message || e);
    return { synced: 0, upserted: 0 };
  }
}

// --- SYNC FUNCTIONS FOR MIGHTYCALL DATA ---

/**
 * Sync MightyCall reports and recordings for an organization
 */
export async function syncMightyCallReports(
  supabaseAdminClient: any,
  orgId: string,
  phoneNumberIds: string[] = [],
  startDate?: string,
  endDate?: string,
  overrideCreds?: any
): Promise<{ reportsSynced: number; recordingsSynced: number }> {
  try {
    const token = await getMightyCallAccessToken(overrideCreds);
    const { start, end } = resolveSyncDateRange(startDate, endDate);

    const phoneLookup: Record<string, string> = {};
    try {
      const { data: phones } = await supabaseAdminClient
        .from('phone_numbers')
        .select('id, number, number_digits')
        .eq('org_id', orgId);
      for (const p of phones || []) {
        const num = String((p as any).number || '');
        const digits = String((p as any).number_digits || num.replace(/\D/g, ''));
        if (num) phoneLookup[num] = (p as any).id;
        if (digits) phoneLookup[digits] = (p as any).id;
      }
    } catch {}

    const callJournal = await fetchMightyCallJournalRequests(token, {
      from: `${start}T00:00:00Z`,
      to: `${end}T23:59:59Z`,
      type: 'Call',
      pageSize: '200',
      page: '1'
    }).catch(() => []);

    const messageTypes = ['Message', 'SMS', 'Sms'];
    const messageJournalLists = await Promise.all(
      messageTypes.map((type) => fetchMightyCallJournalRequests(token, {
        from: `${start}T00:00:00Z`,
        to: `${end}T23:59:59Z`,
        type,
        pageSize: '200',
        page: '1'
      }).catch(() => []))
    );
    const messageJournal = Array.from(
      new Map(
        messageJournalLists
          .flat()
          .map((row: any) => [String(row?.id || row?.requestGuid || `${row?.created || ''}:${row?.textModel?.text || row?.text || ''}`), row])
      ).values()
    );

    const bucketKey = (dateKey: string, phoneId: string | null, digits: string) => `${dateKey}:${phoneId || digits || 'unknown'}`;
    const pushSampleNumber = (row: any, value: any) => {
      const next = String(value || '').trim();
      if (!next) return;
      row.data.sample_numbers = Array.isArray(row.data.sample_numbers) ? row.data.sample_numbers : [];
      if (!row.data.sample_numbers.includes(next)) row.data.sample_numbers.push(next);
    };
    const pushSampleActivity = (row: any, sample: any) => {
      row.data.sample_activity = Array.isArray(row.data.sample_activity) ? row.data.sample_activity : [];
      if (row.data.sample_activity.length < 10) row.data.sample_activity.push(sample);
    };
    const resolvePhoneId = (...values: any[]) => {
      for (const value of values) {
        const text = String(value || '').trim();
        if (!text) continue;
        const digits = text.replace(/\D/g, '');
        if (phoneLookup[text]) return phoneLookup[text];
        if (digits && phoneLookup[digits]) return phoneLookup[digits];
      }
      return null;
    };

    const callBuckets = new Map<string, any>();
    for (const r of Array.isArray(callJournal) ? callJournal : []) {
      const created = String(r?.created || r?.dateTimeUtc || new Date().toISOString());
      const dateKey = created.slice(0, 10);
      const fromNumber = String(r?.from || r?.from_number || r?.client?.address || '').trim();
      const toNumber = String(r?.to || r?.to_number || r?.businessNumber?.number || '').trim();
      const numForMap = toNumber || fromNumber;
      const digits = numForMap.replace(/\D/g, '');
      const phoneId = resolvePhoneId(toNumber, fromNumber);
      const key = bucketKey(dateKey, phoneId, digits);
      if (!callBuckets.has(key)) {
        callBuckets.set(key, {
          org_id: orgId,
          phone_number_id: phoneId,
          report_type: 'calls',
          report_date: dateKey,
          data: {
            source: 'mightycall_api',
            calls_count: 0,
            answered_count: 0,
            missed_count: 0,
            total_duration: 0,
            sample_numbers: [] as string[],
            status_breakdown: {} as Record<string, number>,
            raw_entries_count: 0,
            sample_activity: [] as any[]
          }
        });
      }
      const row = callBuckets.get(key);
      row.data.calls_count += 1;
      const st = String(r?.status || r?.callStatus || '').toLowerCase();
      row.data.status_breakdown[st || 'unknown'] = Number(row.data.status_breakdown[st || 'unknown'] || 0) + 1;
      row.data.raw_entries_count += 1;
      if (st.includes('answer') || st.includes('complete')) row.data.answered_count += 1;
      else if (st.includes('miss')) row.data.missed_count += 1;
      const dur = Number(r?.duration || r?.durationSeconds || 0);
      if (Number.isFinite(dur) && dur > 0) row.data.total_duration += dur;
      pushSampleNumber(row, fromNumber);
      pushSampleNumber(row, toNumber);
      pushSampleActivity(row, {
        id: r?.id || r?.requestGuid || null,
        created,
        status: st || null,
        from_number: fromNumber || null,
        to_number: toNumber || null,
        duration_seconds: Number.isFinite(dur) ? dur : null
      });
    }

    const messageBuckets = new Map<string, any>();
    for (const m of Array.isArray(messageJournal) ? messageJournal : []) {
      const created = String(m?.created || m?.sent_at || new Date().toISOString());
      const dateKey = created.slice(0, 10);
      const fromNumber = String(m?.client?.address || m?.from || m?.from_number || '').trim();
      const toNumber = String(m?.businessNumber?.number || m?.to || m?.to_number || '').trim();
      const numForMap = toNumber || fromNumber;
      const digits = numForMap.replace(/\D/g, '');
      const phoneId = resolvePhoneId(toNumber, fromNumber);
      const key = bucketKey(dateKey, phoneId, digits);
      if (!messageBuckets.has(key)) {
        messageBuckets.set(key, {
          org_id: orgId,
          phone_number_id: phoneId,
          report_type: 'messages',
          report_date: dateKey,
          data: {
            source: 'mightycall_api',
            messages_count: 0,
            inbound_count: 0,
            outbound_count: 0,
            delivered_count: 0,
            failed_count: 0,
            sample_numbers: [] as string[],
            status_breakdown: {} as Record<string, number>,
            raw_entries_count: 0,
            sample_activity: [] as any[]
          }
        });
      }
      const row = messageBuckets.get(key);
      const direction = String(m?.direction || '').toLowerCase();
      const status = String(m?.status || '').toLowerCase();
      row.data.messages_count += 1;
      row.data.raw_entries_count += 1;
      row.data.status_breakdown[status || 'unknown'] = Number(row.data.status_breakdown[status || 'unknown'] || 0) + 1;
      if (direction.includes('out')) row.data.outbound_count += 1;
      else row.data.inbound_count += 1;
      if (status.includes('deliver') || status.includes('sent')) row.data.delivered_count += 1;
      if (status.includes('fail') || status.includes('error')) row.data.failed_count += 1;
      pushSampleNumber(row, fromNumber);
      pushSampleNumber(row, toNumber);
      pushSampleActivity(row, {
        id: m?.id || m?.requestGuid || null,
        created,
        direction: direction || null,
        status: status || null,
        from_number: fromNumber || null,
        to_number: toNumber || null,
        text: m?.textModel?.text || m?.text || null
      });
    }

    const analyticsKeys = new Set([...callBuckets.keys(), ...messageBuckets.keys()]);
    const analyticsRows = Array.from(analyticsKeys).map((key) => {
      const callRow = callBuckets.get(key);
      const messageRow = messageBuckets.get(key);
      const callData = callRow?.data || {};
      const messageData = messageRow?.data || {};
      const sampleNumbers = Array.from(new Set([...(callData.sample_numbers || []), ...(messageData.sample_numbers || [])]));
      const totalCalls = Number(callData.calls_count || 0);
      const answeredCalls = Number(callData.answered_count || 0);
      const totalDuration = Number(callData.total_duration || 0);
      return {
        org_id: orgId,
        phone_number_id: callRow?.phone_number_id || messageRow?.phone_number_id || null,
        report_type: 'analytics',
        report_date: callRow?.report_date || messageRow?.report_date || key.slice(0, 10),
        data: {
          source: 'mightycall_api',
          calls_count: totalCalls,
          answered_count: answeredCalls,
          missed_count: Number(callData.missed_count || 0),
          total_duration: totalDuration,
          messages_count: Number(messageData.messages_count || 0),
          inbound_messages: Number(messageData.inbound_count || 0),
          outbound_messages: Number(messageData.outbound_count || 0),
          delivered_messages: Number(messageData.delivered_count || 0),
          failed_messages: Number(messageData.failed_count || 0),
          answer_rate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 1000) / 10 : 0,
          avg_call_duration_seconds: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
          sample_numbers: sampleNumbers
        }
      };
    });

    const reportRows = [
      ...Array.from(callBuckets.values()),
      ...Array.from(messageBuckets.values()),
      ...analyticsRows
    ];
    try {
      await supabaseAdminClient
        .from('mightycall_reports')
        .delete()
        .eq('org_id', orgId)
        .in('report_type', ['calls', 'messages', 'analytics'])
        .gte('report_date', start)
        .lte('report_date', end);
    } catch {}
    let reportsSynced = 0;
    if (reportRows.length > 0) {
      const { error } = await supabaseAdminClient.from('mightycall_reports').insert(reportRows);
      if (error) console.warn('[MightyCall] reports insert failed:', error);
      else reportsSynced = reportRows.length;
    }

    const recResult = await syncMightyCallRecordings(supabaseAdminClient, orgId, phoneNumberIds, start, end, overrideCreds);
    const recordingsSynced = recResult.recordingsSynced || 0;

    return { reportsSynced, recordingsSynced };
  } catch (e: any) {
    console.warn('[MightyCall] syncMightyCallReports error:', e?.message);
    return { reportsSynced: 0, recordingsSynced: 0 };
  }
}

/**
 * Sync MightyCall recordings for an organization
 */
export async function syncMightyCallRecordings(
  supabaseAdminClient: any,
  orgId: string,
  phoneNumberIds: string[] = [],
  startDate?: string,
  endDate?: string,
  overrideCreds?: any
): Promise<{ recordingsSynced: number }> {
  try {
    const token = await getMightyCallAccessToken(overrideCreds);
    const { start, end } = resolveSyncDateRange(startDate, endDate);
    const apiKeyOverride = overrideCreds?.clientId || undefined;

    const recordings = await fetchMightyCallRecordings(token, phoneNumberIds, start, end, apiKeyOverride).catch(() => []);

    const phoneLookup: Record<string, string> = {};
    try {
      const { data: phones } = await supabaseAdminClient
        .from('phone_numbers')
        .select('id, number, number_digits')
        .eq('org_id', orgId);
      for (const p of phones || []) {
        const num = String((p as any).number || '');
        const digits = String((p as any).number_digits || num.replace(/\D/g, ''));
        if (num) phoneLookup[num] = (p as any).id;
        if (digits) phoneLookup[digits] = (p as any).id;
      }
    } catch {}

    let recordingsSynced = 0;
    if (Array.isArray(recordings) && recordings.length > 0) {
      const normalizedRecordings = recordings.map((r: any) => {
        const metadata = r.metadata || r;
        let fromNumber = null;
        let toNumber = null;

        if (metadata) {
          // Try various metadata field names for from_number - prioritize actual call data
          fromNumber = pickPhoneText(
            metadata.from_number,
            metadata.from,
            metadata.businessNumber,
            metadata.client?.address,
            metadata.client?.number,
            metadata.caller_number,
            metadata.caller?.number,
            metadata.phone_number,
            metadata.phoneNumber
          );

          // Try various metadata field names for to_number
          if (metadata.called && Array.isArray(metadata.called) && metadata.called[0]) {
            toNumber = pickPhoneText(metadata.called[0].phone, metadata.called[0].number, metadata.called[0]);
          }
          if (!toNumber) {
            toNumber = pickPhoneText(
              metadata.to_number,
              metadata.to,
              metadata.recipient,
              metadata.destination_number,
              metadata.destination?.number,
              metadata.businessNumber?.number
            );
          }
        }

        // FALLBACK: if we still don't have phone numbers but have a recording URL, 
        // attempt to extract from the URL itself as a last resort
        // (MightyCall includes phone numbers in some recording URLs)
        if ((!fromNumber || !toNumber) && r.recordingUrl) {
          const urlParts = r.recordingUrl.split('_');
          // Look for patterns like +15162621322 in the URL
          for (const part of urlParts) {
            if (part.startsWith('%2B') || part.startsWith('+')) {
              const num = part.replace(/%2B/g, '+').split('?')[0];
              if (!fromNumber) {
                fromNumber = num;
              } else if (!toNumber) {
                toNumber = num;
                break;
              }
            }
          }
        }

        const numForMap = String(toNumber || fromNumber || '').trim();
        const digits = numForMap.replace(/\D/g, '');
        const phoneId = phoneLookup[numForMap] || phoneLookup[digits] || null;

        const externalId = String(r.callId || r.id || r.recordingUrl || '').trim() || null;

        return {
          external_id: externalId,
          org_id: orgId,
          phone_number_id: phoneId,
          phone_number: pickPhoneText(toNumber, fromNumber),
          call_id: r.callId || r.id,
          recording_url: r.recordingUrl,
          duration_seconds: r.duration || null,
          recording_date: r.date || metadata?.recordingDate || metadata?.recordedAt || metadata?.created || null,
          recorded_at: r.date || metadata?.recordingDate || metadata?.recordedAt || metadata?.created || null,
          from_number: pickPhoneText(fromNumber),
          to_number: pickPhoneText(toNumber),
          metadata: metadata || r
        };
      }).filter((r: any) => !!r.call_id || !!r.recording_url || !!r.external_id);

      const recRows = normalizedRecordings.map((r: any) => ({
        org_id: r.org_id,
        external_id: r.external_id,
        phone_number_id: r.phone_number_id,
        phone_number: r.phone_number,
        call_id: r.call_id,
        recording_url: r.recording_url,
        duration_seconds: r.duration_seconds,
        recording_date: r.recording_date,
        recorded_at: r.recorded_at,
        from_number: r.from_number,
        to_number: r.to_number,
        metadata: {
          ...(r.metadata || {}),
          external_id: r.external_id,
          from_number: r.from_number,
          to_number: r.to_number,
          phone_number: r.phone_number
        }
      }));

      const legacyRows = normalizedRecordings.map((r: any) => ({
        org_id: r.org_id,
        external_id: r.external_id,
        phone_number: r.phone_number,
        recording_url: r.recording_url,
        duration_seconds: r.duration_seconds,
        recorded_at: r.recorded_at
      })).filter((r: any) => !!r.external_id || !!r.recording_url);

      try {
        await supabaseAdminClient
          .from('mightycall_recordings')
          .delete()
          .eq('org_id', orgId)
          .gte('recording_date', `${start}T00:00:00Z`)
          .lte('recording_date', `${end}T23:59:59Z`);
      } catch {}

      const { error } = await supabaseAdminClient.from('mightycall_recordings').insert(recRows);
      if (!error) {
        recordingsSynced = recRows.length;
      } else {
        console.warn('[MightyCall] recordings insert failed, trying legacy schema fallback:', error);

        try {
          await supabaseAdminClient
            .from('mightycall_recordings')
            .delete()
            .eq('org_id', orgId)
            .gte('recorded_at', `${start}T00:00:00Z`)
            .lte('recorded_at', `${end}T23:59:59Z`);
        } catch {}

        const legacyInsert = await supabaseAdminClient.from('mightycall_recordings').insert(legacyRows);
        if (legacyInsert.error) console.warn('[MightyCall] legacy recordings insert failed:', legacyInsert.error);
        else recordingsSynced = legacyRows.length;
      }
    }
    return { recordingsSynced };
  } catch (e: any) {
    console.warn('[MightyCall] syncMightyCallRecordings error:', e?.message);
    return { recordingsSynced: 0 };
  }
}

/**
 * Sync MightyCall SMS messages for an organization
 */
export async function syncMightyCallSMS(
  supabaseAdminClient: any,
  orgId: string,
  overrideCreds?: any
): Promise<{ smsSynced: number }> {
  try {
    const token = await getMightyCallAccessToken(overrideCreds);
    const messages = await fetchMightyCallSMS(token).catch(() => []);
    const phoneLookup: Record<string, string> = {};
    try {
      const { data: phones } = await supabaseAdminClient
        .from('phone_numbers')
        .select('id, number, number_digits')
        .eq('org_id', orgId);
      for (const p of phones || []) {
        const num = String((p as any).number || '').trim();
        const digits = String((p as any).number_digits || num.replace(/\D/g, ''));
        if (num) phoneLookup[num] = (p as any).id;
        if (digits) phoneLookup[digits] = (p as any).id;
      }
    } catch {}

    let smsSynced = 0;
    if (Array.isArray(messages) && messages.length > 0) {
      const smsRows = messages.map((m: any) => {
        const fromNumber = m.client?.address || m.from || null;
        const toNumber = m.businessNumber?.number || m.to || null;
        const mapNumber = String(toNumber || fromNumber || '').trim();
        const mapDigits = mapNumber.replace(/\D/g, '');
        return {
          org_id: orgId,
          phone_id: phoneLookup[mapNumber] || phoneLookup[mapDigits] || null,
          external_id: String(m?.id || m?.requestGuid || m?.external_id || `${m?.created || ''}:${m?.textModel?.text || m?.text || ''}`),
          from_number: fromNumber,
          to_number: toNumber,
          message_text: m.textModel?.text || m.text || null,
          direction: m.direction || 'inbound',
          status: m.status || 'received',
          sent_at: m.created || new Date().toISOString(),
          message_date: m.created || new Date().toISOString(),
          metadata: m
        };
      });

      const { error } = await supabaseAdminClient
        .from('mightycall_sms_messages')
        .upsert(smsRows, { onConflict: 'org_id,external_id' })
        .select();

      if (!error) smsSynced = smsRows.length;
      else console.warn('[MightyCall] SMS insert failed:', error);
    }

    return { smsSynced };
  } catch (e: any) {
    console.warn('[MightyCall] syncMightyCallSMS error:', e?.message);
    return { smsSynced: 0 };
  }
}

export async function syncMightyCallCallHistory(
  supabaseAdminClient: any,
  orgId: string,
  filters?: any,
  overrideCreds?: any
): Promise<{ callsSynced: number }> {
  const token = await getMightyCallAccessToken(overrideCreds);
  const range = resolveSyncDateRange(
    String(filters?.dateStart || filters?.startUtc || ''),
    String(filters?.dateEnd || filters?.endUtc || '')
  );
  const start = range.start;
  const end = range.end;
  let calls = await fetchMightyCallCalls(token, {
    startUtc: start.includes('T') ? start : `${start}T00:00:00Z`,
    endUtc: end.includes('T') ? end : `${end}T23:59:59Z`,
    pageSize: '200',
    skip: '0'
  }).catch(() => []);

  // Fallback to journal requests when calls endpoint is empty for this account.
  if (!Array.isArray(calls) || calls.length === 0) {
    const journalCalls = await fetchMightyCallJournalRequests(token, {
      from: `${start.slice(0, 10)}T00:00:00Z`,
      to: `${end.slice(0, 10)}T23:59:59Z`,
      type: 'Call',
      pageSize: '200',
      page: '1'
    }).catch(() => []);
    calls = (Array.isArray(journalCalls) ? journalCalls : []).map((r: any) => ({
      id: r?.id || r?.requestGuid || null,
      from: r?.from || r?.from_number || r?.client?.address || null,
      to: r?.to || r?.to_number || r?.businessNumber?.number || null,
      status: r?.status || r?.state || r?.callStatus || null,
      duration: r?.duration || r?.durationSeconds || 0,
      dateTimeUtc: r?.created || r?.dateTimeUtc || null,
      endedAt: r?.endedAt || r?.ended_at || null,
      direction: r?.direction || null
    }));
  }

  let callsSynced = 0;
  if (Array.isArray(calls) && calls.length > 0) {
    const rows = calls.map((c: any) => {
      const from = String(
        c?.from ||
        c?.from_number ||
        c?.client?.address ||
        c?.caller?.number ||
        c?.source?.number ||
        ''
      ).trim() || null;
      const to = String(
        c?.to ||
        c?.to_number ||
        c?.businessNumber?.number ||
        c?.called?.[0]?.phone ||
        c?.destination?.number ||
        ''
      ).trim() || null;
      const started = c?.dateTimeUtc || c?.started_at || c?.start_time || c?.created || c?.timestamp || new Date().toISOString();
      const ended = c?.endedAt || c?.ended_at || c?.end_time || null;
      const duration = Number(c?.duration ?? c?.durationSeconds ?? c?.callDuration ?? 0) || 0;
      const st = String(c?.status || c?.callStatus || c?.state || '').toLowerCase();
      return {
        org_id: orgId,
        direction: c?.direction || (to && from ? 'inbound' : null),
        from_number: from,
        to_number: to,
        to_number_digits: to ? to.replace(/\D/g, '') : null,
        status: st || null,
        duration_seconds: duration,
        started_at: started,
        ended_at: ended,
        created_at: new Date().toISOString()
      };
    });

    try {
      await supabaseAdminClient
        .from('calls')
        .delete()
        .eq('org_id', orgId)
        .gte('started_at', `${start.slice(0, 10)}T00:00:00Z`)
        .lte('started_at', `${end.slice(0, 10)}T23:59:59Z`);
    } catch {}

    const { error } = await supabaseAdminClient.from('calls').insert(rows);
    if (error) console.warn('[MightyCall] call history insert error', error);
    else callsSynced = rows.length;
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
// End of file
