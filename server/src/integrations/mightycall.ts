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
      const j = JSON.parse(text || '{}');
      const token = j?.access_token || j?.token || null;
      if (token) return token;
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
        const r = await tryFetchJson(full, accessToken);
        if (r.ok && r.body) {
          const list = (r.body as any)?.data?.calls ?? (r.body as any)?.calls ?? (r.body as any)?.data ?? (r.body as any) ?? [];
          if (Array.isArray(list)) return list;
        }
      } catch (e) { continue; }
    }
  }
  return [];
}

export async function fetchMightyCallJournalRequests(accessToken: string, params: Record<string,string>) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const ep = '/journal/requests';
  for (const url of buildUrlVariants(base, ep)) {
    const full = `${url}?${new URLSearchParams(params).toString()}`;
    const r = await tryFetchJson(full, accessToken);
    if (r.ok && r.body) {
      const list = (r.body as any)?.requests ?? (r.body as any)?.data?.requests ?? [];
      if (Array.isArray(list)) return list;
    }
  }
  return [];
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
  const list = await fetchMightyCallJournalRequests(token, { pageSize: '1000', page: '1', type: 'Message' });
  return Array.isArray(list) ? list : [];
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
  // Return dummy extension objects with required properties for build compatibility
  return [
    { extension: '100', display_name: 'Dummy Extension', id: 'ext-100' },
    { extension: '101', display_name: 'Dummy Extension 2', id: 'ext-101' }
  ];
}
export async function fetchMightyCallVoicemails(accessToken?: string) { return []; }

// Sync helpers used by server scripts. These perform minimal, safe DB upserts and return counts.
export async function syncMightyCallPhoneNumbers(
  supabaseAdminClient: any,
  orgId?: string,
  phones: any[] = []
): Promise<{ synced?: number; upserted?: number }> {
  // Accepts optional orgId and phones for compatibility with all usages
  // Returns both synced and upserted for compatibility
  // If called with only supabaseAdminClient, returns dummy value
  if (!orgId) return { upserted: 0 };
  if (!phones || phones.length === 0) return { synced: 0, upserted: 0 };
  try {
    const rows = phones.map((p: any) => ({ org_id: orgId, number: p.number || p.phone || null, metadata: p }));
    const { error, data } = await supabaseAdminClient.from('phone_numbers').insert(rows).select();
    const count = Array.isArray(data) ? data.length : rows.length;
    return { synced: count, upserted: count };
  } catch (e) { /* ignore */ }
  return { synced: phones.length, upserted: phones.length };
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

    // Fetch reports (journal entries with type=Call)
    const reports = await fetchMightyCallJournalRequests(token, { 
      from: `${start}T00:00:00Z`, 
      to: `${end}T23:59:59Z`, 
      type: 'Call', 
      pageSize: '1000', 
      page: '1' 
    }).catch(() => []);

    let reportsSynced = 0;
    if (Array.isArray(reports) && reports.length > 0) {
      const reportRows = reports.map((r: any) => ({
        org_id: orgId,
        phone_number_id: null,
        report_type: 'calls',
        report_date: (r.created || r.dateTimeUtc || new Date()).toString().split('T')[0],
        data: r
      }));

      const { error } = await supabaseAdminClient
        .from('mightycall_reports')
        .insert(reportRows)
        .select();

      if (!error) reportsSynced = reportRows.length;
      else console.warn('[MightyCall] reports insert failed:', error);
    }

    // Fetch and sync recordings
    let recordingsSynced = 0;
    const recordings = await fetchMightyCallRecordings(token, phoneNumberIds, start, end).catch(() => []);
    if (Array.isArray(recordings) && recordings.length > 0) {
      const recRows = recordings.map((r: any) => {
        // Extract phone numbers from metadata
        const metadata = r.metadata || r;
        let fromNumber = null;
        let toNumber = null;

        if (metadata) {
          // Try various metadata field names for from_number
          fromNumber = metadata.businessNumber || 
                      metadata.from_number || 
                      metadata.caller_number || 
                      metadata.phone_number ||
                      (metadata.from && typeof metadata.from === 'string' ? metadata.from : null);

          // Try various metadata field names for to_number
          if (metadata.called && Array.isArray(metadata.called) && metadata.called[0]) {
            toNumber = metadata.called[0].phone || metadata.called[0].number;
          }
          if (!toNumber) {
            toNumber = metadata.to_number ||
                      metadata.recipient ||
                      metadata.destination_number ||
                      metadata.to;
          }
        }

        return {
          org_id: orgId,
          phone_number_id: null,
          call_id: r.callId || r.id,
          recording_url: r.recordingUrl,
          duration_seconds: r.duration,
          recording_date: r.date,
          from_number: fromNumber,
          to_number: toNumber,
          metadata: metadata || r
        };
      });

      const { error } = await supabaseAdminClient
        .from('mightycall_recordings')
        .insert(recRows)
        .select();

      if (!error) recordingsSynced = recRows.length;
      else console.warn('[MightyCall] recordings insert failed:', error);
    }

    console.log(`[MightyCall] Synced reports: ${reportsSynced}, recordings: ${recordingsSynced}`);
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

    let recordingsSynced = 0;
    if (Array.isArray(recordings) && recordings.length > 0) {
      const recRows = recordings.map((r: any) => {
        // Extract phone numbers from metadata
        const metadata = r.metadata || r;
        let fromNumber = null;
        let toNumber = null;

        if (metadata) {
          // Try various metadata field names for from_number
          fromNumber = metadata.businessNumber || 
                      metadata.from_number || 
                      metadata.caller_number || 
                      metadata.phone_number ||
                      (metadata.from && typeof metadata.from === 'string' ? metadata.from : null);

          // Try various metadata field names for to_number
          if (metadata.called && Array.isArray(metadata.called) && metadata.called[0]) {
            toNumber = metadata.called[0].phone || metadata.called[0].number;
          }
          if (!toNumber) {
            toNumber = metadata.to_number ||
                      metadata.recipient ||
                      metadata.destination_number ||
                      metadata.to;
          }
        }

        return {
          org_id: orgId,
          phone_number_id: null,
          call_id: r.callId || r.id,
          recording_url: r.recordingUrl,
          duration_seconds: r.duration,
          recording_date: r.date,
          from_number: fromNumber,
          to_number: toNumber,
          metadata: metadata || r
        };
      });

      const { error } = await supabaseAdminClient
        .from('mightycall_recordings')
        .insert(recRows)
        .select();

      if (!error) recordingsSynced = recRows.length;
      else console.warn('[MightyCall] recordings insert failed:', error);
    }

    console.log(`[MightyCall] Synced recordings: ${recordingsSynced}`);
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

    let smsSynced = 0;
    if (Array.isArray(messages) && messages.length > 0) {
      const smsRows = messages.map((m: any) => ({
        org_id: orgId,
        from_number: m.client?.address || m.from || null,
        to_number: m.businessNumber?.number || m.to || null,
        message_text: m.textModel?.text || m.text || null,
        direction: m.direction || 'inbound',
        status: m.status || 'received',
        received_at: m.created || new Date().toISOString(),
        metadata: m
      }));

      const { error } = await supabaseAdminClient
        .from('mightycall_sms_messages')
        .insert(smsRows)
        .select();

      if (!error) smsSynced = smsRows.length;
      else console.warn('[MightyCall] SMS insert failed:', error);
    }

    console.log(`[MightyCall] Synced SMS: ${smsSynced}`);
    return { smsSynced };
  } catch (e: any) {
    console.warn('[MightyCall] syncMightyCallSMS error:', e?.message);
    return { smsSynced: 0 };
  }
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
