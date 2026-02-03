import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, MIGHTYCALL_BASE_URL } from '../config/env';

async function delayMs(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
async function requestWithRetry(url: string, opts: any, retries = 2, backoff = 250) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await fetch(url, opts);
    } catch (e: any) {
      if (attempt > retries) throw e;
      await delayMs(backoff * attempt);
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
  const candidates = buildUrlVariants(base, '/auth/token');

  for (const url of candidates) {
    try {
      const body = new URLSearchParams();
      body.append('grant_type', 'client_credentials');
      body.append('client_id', clientId);
      body.append('client_secret', clientSecret);
      const res = await requestWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-key': MIGHTYCALL_API_KEY || '' }, body: body.toString() }, 2, 300);
      const text = await res.text().catch(() => '');
      if (!res.ok) continue;
      try {
        const j = JSON.parse(text || '{}');
        const token = j?.access_token || j?.token || null;
        if (token) return token;
      } catch (e) { continue; }
    } catch (e) { continue; }
  }
  throw new Error('Failed to obtain MightyCall access token');
}

async function tryFetchJson(url: string, token?: string) {
  const res = await requestWithRetry(url, { method: 'GET', headers: { Accept: 'application/json', 'x-api-key': MIGHTYCALL_API_KEY || '', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, 2, 300);
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, body: text };
  try { return { ok: true, status: res.status, body: JSON.parse(text || 'null') }; } catch (e) { return { ok: true, status: res.status, body: text }; }
}

export async function fetchMightyCallPhoneNumbers(token: string) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/phonenumbers', '/phone_numbers', '/v4/phonenumbers', '/v4/phone_numbers'];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      const r = await tryFetchJson(url, token);
      if (r.ok && r.body) {
        const list = r.body?.data?.phoneNumbers ?? r.body?.phoneNumbers ?? r.body?.data ?? [];
        if (Array.isArray(list)) return list;
      }
    }
  }
  return [];
}

export async function fetchMightyCallCalls(token: string, filters?: any) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoints = ['/calls', '/api/calls', '/v4/calls', '/api/calls/list'];
  for (const ep of endpoints) {
    for (const url of buildUrlVariants(base, ep)) {
      try {
        const params = new URLSearchParams();
        if (filters?.startUtc) params.append('startUtc', filters.startUtc);
        if (filters?.endUtc) params.append('endUtc', filters.endUtc);
        if (filters?.dateStart) params.append('dateStart', filters.dateStart);
        if (filters?.dateEnd) params.append('dateEnd', filters.dateEnd);
        if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
        if (filters?.skip) params.append('skip', String(filters.skip));
        const full = params.toString() ? `${url}?${params.toString()}` : url;
        const r = await tryFetchJson(full, token);
        if (r.ok && r.body) {
          const list = r.body?.data?.calls ?? r.body?.calls ?? r.body?.data ?? r.body ?? [];
          if (Array.isArray(list)) return list;
        }
      } catch (e) { continue; }
    }
  }
  return [];
}

export async function fetchMightyCallJournalRequests(token: string, params: Record<string,string>) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const ep = '/journal/requests';
  for (const url of buildUrlVariants(base, ep)) {
    const full = `${url}?${new URLSearchParams(params).toString()}`;
    const r = await tryFetchJson(full, token);
    if (r.ok && r.body) {
      const list = r.body?.requests ?? r.body?.data?.requests ?? [];
      if (Array.isArray(list)) return list;
    }
  }
  return [];
}

export async function fetchMightyCallRecordings(token: string, phoneNumberIds: string[] = [], startDate?: string, endDate?: string) {
  const start = startDate || '';
  const end = endDate || '';
  const calls = await fetchMightyCallCalls(token, { startUtc: start, endUtc: end, pageSize: '1000', skip: '0' });
  const recordings: any[] = [];
  for (const c of calls) {
    const rec = c?.callRecord ?? c?.recording ?? null;
    if (rec && (rec.uri || rec.fileName || rec.link)) recordings.push({ id: c.id || c.callId, callId: c.id || c.callId, recordingUrl: rec.uri || rec.fileName || rec.link, duration: c.duration ?? null, date: c.dateTimeUtc ?? c.created ?? null, metadata: c });
  }
  if (recordings.length > 0) return recordings;

  const jr = await fetchMightyCallJournalRequests(token, { from: `${start}T00:00:00Z`, to: `${end}T23:59:59Z`, type: 'Call', pageSize: '1000', page: '1' });
  for (const r of jr) {
    const link = r?.recording?.link ?? r?.recording?.uri ?? r?.textModel?.text ?? null;
    if (link) recordings.push({ id: r.id, callId: r.id, recordingUrl: link, duration: null, date: r.created ?? null, metadata: r });
  }
  return recordings;
}

export async function fetchMightyCallSMS(token?: string) {
  const t = token || await getMightyCallAccessToken();
  const list = await fetchMightyCallJournalRequests(t, { pageSize: '1000', page: '1', type: 'Message' });
  return Array.isArray(list) ? list : [];
}

export async function syncMightyCallReports(supabaseAdminClient: any, orgId: string, phoneNumberIds: string[] = [], startDate: string, endDate: string, overrideCreds?: { clientId?: string; clientSecret?: string }) {
  const token = await getMightyCallAccessToken(overrideCreds);
  const reports = await fetchMightyCallJournalRequests(token, { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z`, type: 'Call', pageSize: '1000', page: '1' }).catch(()=>[]);
  
  let reportsSynced = 0;

  // Parse ISO 8601 duration (e.g., "00:00:25" or "PT25S") to seconds
  const parseDurationToSeconds = (durationStr: string): number => {
    if (!durationStr) return 0;
    // Handle ISO 8601 PT format
    if (durationStr.startsWith('PT')) {
      const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      if (match) {
        const hours = parseInt(match[1] || '0', 10) * 3600;
        const minutes = parseInt(match[2] || '0', 10) * 60;
        const seconds = parseFloat(match[3] || '0');
        return hours + minutes + seconds;
      }
    }
    // Handle HH:MM:SS format
    const parts = durationStr.split(':').map(p => parseFloat(p));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseFloat(durationStr) || 0;
  };

  // Get phone numbers for this org to map business numbers to IDs
  let phones: any[] = [];
  try {
    const result = await supabaseAdminClient
      .from('phone_numbers')
      .select('id, number')
      .eq('org_id', orgId);
    if (result.data) phones = result.data;
  } catch (e) {
    console.log(`[syncMightyCallReports] Could not fetch phone numbers for org ${orgId}`);
  }

  const phoneMap = new Map<string, string>();
  phones.forEach((p: any) => {
    phoneMap.set(p.number, p.id);
  });

  if (Array.isArray(reports) && reports.length > 0) {
    const map = new Map<string, any>();
    for (const e of reports) {
      const phone = e?.businessNumber?.number || e?.businessNumber || 'unknown';
      const phoneId = phoneMap.get(phone);
      const dateKey = (e.created || e.dateTimeUtc || new Date()).toString().split('T')[0];
      const key = `${phoneId || 'null'}:${dateKey}`;
      const bucket = map.get(key) || { phone_id: phoneId || null, phone_number: phone, report_date: dateKey, calls_count: 0, answered_count: 0, missed_count: 0, total_duration: 0 };
      bucket.calls_count += 1;
      const st = String(e.state || e.callStatus || '').toLowerCase();
      if (st === 'connected') bucket.answered_count += 1;
      if (st === 'missed' || st === 'dropped' || st === 'noanswer' || st === 'no_answer') bucket.missed_count += 1;
      if (e.duration) bucket.total_duration += parseDurationToSeconds(String(e.duration));
      map.set(key, bucket);
    }

    const rows = Array.from(map.values()).map((r:any)=>({ org_id: orgId, phone_number_id: r.phone_id, report_type: 'calls', report_date: r.report_date, data: { calls_count: r.calls_count, answered_count: r.answered_count, missed_count: r.missed_count, total_duration: r.total_duration, phone_number: r.phone_number } }));
    if (rows.length > 0) {
      const { error, data } = await supabaseAdminClient.from('mightycall_reports').insert(rows).select();
      if (!error && Array.isArray(data)) {
        reportsSynced = data.length;
      } else if (error && error.code === '23505') {
        // Unique violation - row already exists, that's okay for idempotent daily aggregates
        reportsSynced = rows.length;
      }
    }
  }
  return { reportsSynced, recordingsSynced: 0 };
}

export async function syncMightyCallRecordings(supabaseAdminClient: any, orgId: string, phoneNumberIds: string[] = [], startDate: string, endDate: string, overrideCreds?: { clientId?: string; clientSecret?: string }) {
  const token = await getMightyCallAccessToken(overrideCreds);
  console.log(`[syncMightyCallRecordings] Org ${orgId}: fetching recordings (${phoneNumberIds.length} phones, ${startDate}-${endDate})`);;
  const recordings = await fetchMightyCallRecordings(token, phoneNumberIds, startDate, endDate).catch(()=>[]);
  console.log(`[syncMightyCallRecordings] Org ${orgId}: API returned ${recordings.length} recordings`);
  let recordingsSynced = 0;
  if (Array.isArray(recordings) && recordings.length > 0) {
    // Use recording ID as call_id. The FK constraint may block this - if so, it must be dropped at DB level
    const recRows = recordings.map((r:any)=>({ org_id: orgId, phone_number_id: null, call_id: r.callId || r.id || `${Date.now()}-${Math.random()}`, recording_url: r.recordingUrl, duration_seconds: r.duration, recording_date: r.date, metadata: r.metadata || r }));
    console.log(`[syncMightyCallRecordings] Org ${orgId}: inserting ${recRows.length} rows, sample call_id="${recRows[0]?.call_id}"`);
    const { error, data } = await supabaseAdminClient.from('mightycall_recordings').insert(recRows).select();
    if (error) {
      console.log(`[syncMightyCallRecordings] Org ${orgId}: insert FAILED`);
      console.log(`  Error: ${error.message}`);
      if (error.message && error.message.includes('foreign key')) {
        console.log(`  Fix: Apply migration in Supabase SQL Editor:`);
        console.log(`    ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;`);
      }
    } else {
      recordingsSynced = Array.isArray(data) ? data.length : recRows.length;
      console.log(`[syncMightyCallRecordings] Org ${orgId}: insert SUCCESS, synced ${recordingsSynced} rows`);
    }
    if (error && error.code === '23505') {
      // Unique violation - already synced
      recordingsSynced = recRows.length;
    }
  }
  return { recordingsSynced };
}

export async function syncMightyCallSMS(supabaseAdminClient: any, orgId: string, overrideCreds?: { clientId?: string; clientSecret?: string }) {
  const token = await getMightyCallAccessToken(overrideCreds);
  console.log(`[syncMightyCallSMS] Org ${orgId}: fetching SMS messages`);
  const list = await fetchMightyCallSMS(token).catch(()=>[]);
  console.log(`[syncMightyCallSMS] Org ${orgId}: API returned ${list.length} SMS messages`);
  let smsSynced = 0;
  if (!Array.isArray(list) || list.length === 0) return { smsSynced };
  const rows = list.map((m:any)=>({ org_id: orgId, external_id: m.id ?? m.requestGuid ?? null, from_number: m.client?.address ?? m.from ?? null, to_number: m.businessNumber?.number ?? m.to ?? null, message_text: m.text ?? m.body ?? m.textModel?.text ?? null, status: m.status ?? 'received', sent_at: m.created ?? m.dateTimeUtc ?? new Date().toISOString(), metadata: m }));
  
  try {
    console.log(`[syncMightyCallSMS] Org ${orgId}: inserting ${rows.length} rows into mightycall_sms_messages`);
    const { error, data } = await supabaseAdminClient.from('mightycall_sms_messages').insert(rows).select();
    if (error) {
      console.log(`[syncMightyCallSMS] Org ${orgId}: mightycall_sms_messages insert FAILED - ${error.message}`);
      if (error.code === '23505') {
        smsSynced = rows.length;
      } else if (error.code === '42P10' || error.message.includes('does not exist')) {
        // Table might not exist, try fallback to sms_logs
        console.log(`[syncMightyCallSMS] Org ${orgId}: falling back to sms_logs table`);
        const { error: fallback, data: fallbackData } = await supabaseAdminClient.from('sms_logs').insert(rows.map(r=>({ org_id: r.org_id, from_number: r.from_number, to_numbers: r.to_number, message_text: r.message_text, direction: 'inbound', status: r.status, sent_at: r.sent_at, metadata: r.metadata }))).select();
        if (!fallback && Array.isArray(fallbackData)) {
          smsSynced = fallbackData.length;
          console.log(`[syncMightyCallSMS] Org ${orgId}: fallback insert SUCCESS, synced ${smsSynced} rows`);
        } else if (fallback) {
          console.log(`[syncMightyCallSMS] Org ${orgId}: fallback FAILED - ${fallback.message}`);
        }
      }
    } else {
      smsSynced = Array.isArray(data) ? data.length : rows.length;
      console.log(`[syncMightyCallSMS] Org ${orgId}: insert SUCCESS, synced ${smsSynced} rows`);
    }
  } catch (e: any) {
    console.log(`[syncMightyCallSMS] Org ${orgId}: exception - ${e.message}, trying fallback`);
    const { error: fallback, data: fallbackData } = await supabaseAdminClient.from('sms_logs').insert(rows.map(r=>({ org_id: r.org_id, from_number: r.from_number, to_numbers: r.to_number, message_text: r.message_text, direction: 'inbound', status: r.status, sent_at: r.sent_at, metadata: r.metadata }))).select();
    if (!fallback && Array.isArray(fallbackData)) {
      smsSynced = fallbackData.length;
      console.log(`[syncMightyCallSMS] Org ${orgId}: fallback SUCCESS, synced ${smsSynced} rows`);
    } else if (fallback) {
      console.log(`[syncMightyCallSMS] Org ${orgId}: fallback FAILED - ${fallback.message}`);
    }
  }
  return { smsSynced };
}

export async function syncMightyCallCallHistory(supabaseAdminClient: any, orgId: string, filters?: any): Promise<{ callsSynced: number }> {
  const token = await getMightyCallAccessToken();
  const calls = await fetchMightyCallCalls(token, filters).catch(()=>[]);
  let callsSynced = 0;

  try {
    console.log('[MightyCall sync] fetched calls count:', Array.isArray(calls) ? calls.length : 0);
    if (Array.isArray(calls) && calls.length > 0) {
      console.log('[MightyCall sync] calls sample:', JSON.stringify(calls.slice(0, 3), null, 2));
    }
  } catch (e) {
    console.warn('[MightyCall sync] failed to stringify calls sample', e);
  }

  if (Array.isArray(calls) && calls.length > 0) {
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
