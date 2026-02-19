// --- STUB FOR MISSING syncMightyCallVoicemails ---
export async function syncMightyCallVoicemails(
  supabaseAdminClient: any,
  orgId: string,
  overrideCreds?: any
): Promise<{ voicemailsSynced: number }> {
  return { voicemailsSynced: 0 };
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'x-api-key': MIGHTYCALL_API_KEY || '' },
      body: formBody.toString()
    },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': MIGHTYCALL_API_KEY || '' },
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

async function tryFetchJson(url: string, token?: string) {
  const res = await requestWithRetry(url, { method: 'GET', headers: { Accept: 'application/json', 'x-api-key': MIGHTYCALL_API_KEY || '', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, 2, 300);
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

export async function fetchMightyCallCalls(accessToken: string, filters?: any) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/calls', '/api/calls', '/v4/calls', '/api/calls/list', '/journal/calls', '/call-history', '/callhistory'];
  const pageSize = Math.min(Math.max(parseInt(String(filters?.pageSize || '200'), 10) || 200, 1), 1000);
  const maxPages = 50;
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

          const full = `${url}?${params.toString()}`;
          const r = await tryFetchJson(full, accessToken);
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

      if (success && all.length > 0) return all;
    }
  }
  return all;
}

export async function fetchMightyCallJournalRequests(accessToken: string, params: Record<string,string>) {
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
      const r = await tryFetchJson(full, accessToken);
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

export async function fetchMightyCallRecordings(accessToken: string, phoneNumberIds: string[] = [], startDate?: string, endDate?: string) {
  const calls = await fetchMightyCallCalls(accessToken, { startUtc: startDate, endUtc: endDate, pageSize: '1000', skip: '0' });
  const recordings: any[] = [];
  for (const c of calls) {
    const rec = (c as any)?.callRecord ?? (c as any)?.recording ?? null;
    if (rec && (rec.uri || rec.fileName || rec.link)) recordings.push({ id: (c as any).id || (c as any).callId, callId: (c as any).id || (c as any).callId, recordingUrl: rec.uri || rec.fileName || rec.link, duration: (c as any).duration ?? null, date: (c as any).dateTimeUtc ?? (c as any).created ?? null, metadata: c });
  }
  if (recordings.length > 0) return recordings;

  const jr = await fetchMightyCallJournalRequests(accessToken, { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z`, type: 'Call', pageSize: '1000', page: '1' });
  for (const r of jr) {
    const link = (r as any)?.recording?.link ?? (r as any)?.recording?.uri ?? (r as any)?.textModel?.text ?? null;
    if (link) recordings.push({ id: (r as any).id, callId: (r as any).id, recordingUrl: link, duration: null, date: (r as any).created ?? null, metadata: r });
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

// Lightweight placeholders for extensions/voicemails
export async function fetchMightyCallExtensions(accessToken?: string) {
  const token = accessToken || await getMightyCallAccessToken();
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/extensions', '/users/extensions', '/v4/extensions'];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, token);
      if (!r.ok || !r.body) continue;
      const list = (r.body as any)?.data?.extensions ?? (r.body as any)?.extensions ?? (r.body as any)?.data ?? [];
      if (Array.isArray(list)) {
        return list
          .map((x: any) => ({
            id: x.id || x.externalId || x.extensionId || null,
            extension: String(x.extension || x.ext || x.number || '').trim(),
            display_name: x.displayName || x.name || x.fullName || null
          }))
          .filter((x: any) => x.extension);
      }
    }
  }
  return [];
}
export async function fetchMightyCallVoicemails(accessToken?: string) { return []; }

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
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

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

    const journal = await fetchMightyCallJournalRequests(token, {
      from: `${start}T00:00:00Z`,
      to: `${end}T23:59:59Z`,
      type: 'Call',
      pageSize: '200',
      page: '1'
    }).catch(() => []);

    const buckets = new Map<string, any>();
    for (const r of Array.isArray(journal) ? journal : []) {
      const created = String(r?.created || r?.dateTimeUtc || new Date().toISOString());
      const dateKey = created.slice(0, 10);
      const fromNumber = String(r?.from || r?.from_number || r?.client?.address || '').trim();
      const toNumber = String(r?.to || r?.to_number || r?.businessNumber?.number || '').trim();
      const numForMap = toNumber || fromNumber;
      const digits = numForMap.replace(/\D/g, '');
      const phoneId = phoneLookup[numForMap] || phoneLookup[digits] || null;
      const key = `${dateKey}:${phoneId || digits || 'unknown'}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          org_id: orgId,
          phone_number_id: phoneId,
          report_type: 'calls',
          report_date: dateKey,
          data: { calls_count: 0, answered_count: 0, missed_count: 0, total_duration: 0, sample_numbers: [] as string[] }
        });
      }
      const row = buckets.get(key);
      row.data.calls_count += 1;
      const st = String(r?.status || r?.callStatus || '').toLowerCase();
      if (st.includes('answer') || st.includes('complete')) row.data.answered_count += 1;
      else if (st.includes('miss')) row.data.missed_count += 1;
      const dur = Number(r?.duration || r?.durationSeconds || 0);
      if (Number.isFinite(dur) && dur > 0) row.data.total_duration += dur;
      if (numForMap && row.data.sample_numbers.length < 3 && !row.data.sample_numbers.includes(numForMap)) row.data.sample_numbers.push(numForMap);
    }

    const reportRows = Array.from(buckets.values());
    try {
      await supabaseAdminClient
        .from('mightycall_reports')
        .delete()
        .eq('org_id', orgId)
        .eq('report_type', 'calls')
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
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const recordings = await fetchMightyCallRecordings(token, phoneNumberIds, start, end).catch(() => []);

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
      const recRows = recordings.map((r: any) => {
        const metadata = r.metadata || r;
        let fromNumber = null;
        let toNumber = null;

        if (metadata) {
          // Try various metadata field names for from_number - prioritize actual call data
          fromNumber = metadata.from_number ||
                      metadata.from ||
                      metadata.businessNumber || 
                      metadata.caller_number || 
                      metadata.phone_number ||
                      (metadata.phoneNumber && typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber : null);

          // Try various metadata field names for to_number
          if (metadata.called && Array.isArray(metadata.called) && metadata.called[0]) {
            toNumber = metadata.called[0].phone || metadata.called[0].number;
          }
          if (!toNumber) {
            toNumber = metadata.to_number ||
                      metadata.to ||
                      metadata.recipient ||
                      metadata.destination_number;
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

        return {
          org_id: orgId,
          phone_number_id: phoneId,
          call_id: r.callId || r.id,
          recording_url: r.recordingUrl,
          duration_seconds: r.duration || null,
          recording_date: r.date,
          metadata: metadata || r
        };
      }).filter((r: any) => !!r.call_id || !!r.recording_url);

      try {
        await supabaseAdminClient
          .from('mightycall_recordings')
          .delete()
          .eq('org_id', orgId)
          .gte('recording_date', `${start}T00:00:00Z`)
          .lte('recording_date', `${end}T23:59:59Z`);
      } catch {}

      const { error } = await supabaseAdminClient.from('mightycall_recordings').insert(recRows);
      if (error) console.warn('[MightyCall] recordings insert failed:', error);
      else recordingsSynced = recRows.length;
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
  const start = String(filters?.dateStart || filters?.startUtc || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const end = String(filters?.dateEnd || filters?.endUtc || new Date().toISOString().slice(0, 10));
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
