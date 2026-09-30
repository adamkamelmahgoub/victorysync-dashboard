import fetch from 'node-fetch';
import { supabaseAdmin as db } from '../lib/supabaseClient';
import { getOrgIntegration } from '../lib/integrationsStore';
import { getMightyCallAccessToken, normalizeMightyCallApiBase } from '../integrations/mightycall';
import { importTransferPage, nextTransferCursor, TRANSFER_PAGE_SIZE as PAGE_SIZE } from './transferImport';

export const TRANSFER_POLL_MS = 60_000;
let databaseEnabled = false;
export const transferImportEnabled = () => process.env.WORKFORCE_MIGHTYCALL_SYNC === 'true' || databaseEnabled;
export async function refreshTransferImportConfig() {
  const result = await db.from('wf_settings').select('mightycall_import_enabled').eq('id', true).single();
  databaseEnabled = !result.error && result.data?.mightycall_import_enabled === true;
  return !result.error;
}
let running = false;
let started = false;
export const transferWorkerStatus = () => ({ enabled: transferImportEnabled(), polling: started && process.env.MIGHTYCALL_DISABLE_POLLING !== 'true', running, interval_ms: TRANSFER_POLL_MS });

async function providerGet(path: string, token: string, key: string, base: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${normalizeMightyCallApiBase(base)}${path}`, { headers: { Authorization: `Bearer ${token}`, 'x-api-key': key, Accept: 'application/json' }, signal: controller.signal as any });
    if (!response.ok) throw new Error(`MightyCall request failed (${response.status}). Check the client's API credentials and permissions.`);
    const body: any = await response.json();
    if (body?.isSuccess === false) throw new Error('MightyCall rejected the request. Check the client integration.');
    return body;
  } finally { clearTimeout(timer); }
}

export async function runWorkforceTransferSync(manual = false) {
  if (running) return;
  running = true;
  try {
    await refreshTransferImportConfig();
    if (!manual && !transferImportEnabled()) return;
    const routes = await db.from('wf_provider_routes').select('client_id,agent_id,campaign_id,business_number').eq('active', true);
    if (routes.error) throw new Error('Apply the workforce migrations before enabling automatic transfers.');
    const clients = [...new Set((routes.data || []).map(r => r.client_id))];
    for (const clientId of clients) {
      const claim = await db.rpc('wf_claim_transfer_sync', { cid: clientId });
      if (claim.error) throw new Error('Apply migration 055 to enable the transfer import queue.');
      const job = claim.data;
      if (!job) continue;
      try {
        const assignments = await db.from('wf_assignments').select('agent_id,campaign_id').eq('client_id', clientId).eq('active', true);
        if (assignments.error) throw new Error('Unable to verify campaign assignments.');
        if (!(assignments.data || []).some(a => (routes.data || []).some(r => r.client_id === clientId && r.agent_id === a.agent_id && r.campaign_id === a.campaign_id))) {
          throw new Error('Assign a routed agent to this client campaign in Administration before importing transfers.');
        }
        const integration = await getOrgIntegration(clientId, 'mightycall');
        if (integration && !integration.credentials) throw new Error('The stored MightyCall credentials cannot be decrypted. Reconnect this client integration.');
        const credentials = integration?.credentials;
        const base = credentials?.baseUrl || process.env.MIGHTYCALL_API_BASE_URL || process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4';
        const key = credentials ? credentials.clientId || credentials.apiKey : process.env.MIGHTYCALL_API_KEY;
        const secret = credentials ? credentials.clientSecret || credentials.userKey : process.env.MIGHTYCALL_USER_KEY;
        if (!key || !secret) throw new Error('Configure MightyCall API credentials for this client.');
        let token: string;
        try { token = await getMightyCallAccessToken({ clientId: key, clientSecret: secret, baseUrl: base, strict: true }); }
        catch { throw new Error('MightyCall authentication failed. Reconnect this client with working API credentials.'); }
        const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        const isCalls = job.phase === 'calls';
        if (isCalls) {
          query.set('startUtc', job.window_start); query.set('endUtc', job.window_end); query.set('skip', String(job.page_offset));
        } else {
          query.set('from', job.window_start); query.set('to', job.window_end); query.set('page', String(job.page_offset / PAGE_SIZE + 1)); query.set('showUsers', 'true'); query.set('type', 'call');
        }
        const body = await providerGet(`${isCalls ? '/calls' : '/journal/requests'}?${query}`, token, key, base);
        const rows = isCalls ? body?.data?.calls ?? body?.calls : body?.data?.requests ?? body?.requests;
        if (!Array.isArray(rows) || rows.length > PAGE_SIZE) throw new Error('Unexpected MightyCall pagination response. Import paused without advancing the cursor.');
        const returnedPage = body?.data?.currentPage ?? body?.currentPage;
        if (!isCalls && returnedPage !== undefined && Number(returnedPage) !== job.page_offset / PAGE_SIZE + 1) throw new Error('MightyCall returned the wrong journal page. Import paused without advancing the cursor.');
        const calls = [];
        const businessNumbers = new Set((routes.data || []).filter(r => r.client_id === clientId).map(r => String(r.business_number).replace(/\D/g, '')));
        for (const raw of rows) {
          const businessNumber = String(raw.businessNumber?.number || raw.businessNumber || '').replace(/\D/g, '');
          if (businessNumber && !businessNumbers.has(businessNumber)) continue;
          if (!isCalls) { calls.push(raw); continue; }
          if (!raw.id) throw new Error('MightyCall returned a call without an ID.');
          const detail = await providerGet(`/calls/${encodeURIComponent(raw.id)}`, token, key, base);
          const data = detail?.data?.call ?? detail?.data ?? detail?.call ?? detail;
          if (!data || typeof data !== 'object' || Array.isArray(data) || String(data.id) !== String(raw.id)) throw new Error('Unexpected MightyCall call detail response.');
          calls.push({ ...raw, ...data });
        }
        const counts = await importTransferPage(calls, clientId, async event => {
          const result = await db.rpc('wf_ingest_transfer', { event });
          if (result.error) throw new Error('Transfer storage failed. This page will be retried.');
          return result.data;
        });
        const saved = await db.from('wf_transfer_sync_state').update({ ...nextTransferCursor(job, rows.length),
          imported_count: job.imported_count + counts.imported, queued_count: job.queued_count + counts.queued,
          last_error: null, lease_token: null, lease_until: null,
        }).eq('id', job.id).eq('lease_token', job.lease_token);
        if (saved.error) throw new Error('Unable to save transfer import progress. This page will be retried.');
      } catch (error: any) {
        await db.from('wf_transfer_sync_state').update({ last_error: String(error?.name === 'AbortError' ? 'MightyCall timed out. This page will be retried.' : error?.message || 'Transfer import failed.').slice(0, 500), lease_token: null, lease_until: null }).eq('id', job.id).eq('lease_token', job.lease_token);
      }
    }
  } finally { running = false; }
}

export function startWorkforceTransferPolling() {
  if (started || process.env.MIGHTYCALL_DISABLE_POLLING === 'true') return;
  started = true;
  const tick = () => void runWorkforceTransferSync().catch(() => console.warn('[workforce transfers] Import unavailable. Check migration 055 and integration configuration.'));
  setInterval(tick, TRANSFER_POLL_MS).unref?.();
  tick();
}
