import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { supabaseAdmin } from '../lib/supabaseClient';
import { isOrgMember, isPlatformAdmin } from '../auth/rbac';
import { decryptObj, getOrgIntegration } from '../lib/integrationsStore';
import { fetchMightyCallCallDetail, getMightyCallAccessToken } from '../integrations/mightycall';
import { findRecordingUrl } from '../mightycall/normalizers';
import { syncCallDetails, syncRecentCalls } from '../mightycall/sync';

const router = express.Router();

function actorId(req: express.Request) {
  return String((req as any).actorId || req.header('x-user-id') || '');
}

async function canAccessOrg(req: express.Request, orgId: string) {
  const actor = actorId(req);
  return !!actor && ((await isPlatformAdmin(actor)) || (await isOrgMember(actor, orgId)));
}

async function orgCredentials(orgId: string) {
  const integration = await getOrgIntegration(orgId, 'mightycall');
  const credentials = integration?.credentials || null;
  if (!credentials) throw new Error('mightycall_credentials_unavailable');
  const clientId = credentials.clientId || credentials.apiKey || undefined;
  const clientSecret = credentials.clientSecret || credentials.userKey || undefined;
  if (!clientId || !clientSecret) throw new Error('mightycall_credentials_incomplete');
  return { clientId, clientSecret };
}

async function healthForOrg(orgId: string) {
  const now = Date.now();
  const [inbox, call, recording, integration] = await Promise.all([
    Promise.resolve(supabaseAdmin.from('mightycall_webhook_inbox').select('created_at, status, error_code').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle()).then((r) => r.data || null).catch(() => null),
    Promise.resolve(supabaseAdmin.from('mightycall_call_logs').select('updated_at, started_at').eq('org_id', orgId).order('updated_at', { ascending: false }).limit(1).maybeSingle()).then((r) => r.data || null).catch(() => null),
    Promise.resolve(supabaseAdmin.from('mightycall_recordings').select('updated_at, recording_date').eq('org_id', orgId).order('updated_at', { ascending: false }).limit(1).maybeSingle()).then((r) => r.data || null).catch(() => null),
    getOrgIntegration(orgId, 'mightycall').catch(() => null),
  ]);
  const webhookAt = inbox?.created_at || null;
  const callAt = call?.updated_at || call?.started_at || null;
  const recordingAt = recording?.updated_at || recording?.recording_date || null;
  const webhookAge = webhookAt ? now - Date.parse(webhookAt) : Number.POSITIVE_INFINITY;
  const callAge = callAt ? now - Date.parse(callAt) : Number.POSITIVE_INFINITY;
  const snapshot = {
    org_id: orgId,
    provider: 'mightycall',
    credentials_ok: !!integration?.credentials,
    webhook_ok: webhookAge < 24 * 60 * 60 * 1000 && inbox?.status !== 'dead_letter',
    calls_sync_ok: callAge < 24 * 60 * 60 * 1000,
    recordings_sync_ok: !!recordingAt,
    last_webhook_at: webhookAt,
    last_call_sync_at: callAt,
    last_recording_sync_at: recordingAt,
    last_error_code: inbox?.error_code || null,
    metrics: { webhook_age_ms: Number.isFinite(webhookAge) ? webhookAge : null, call_age_ms: Number.isFinite(callAge) ? callAge : null },
    checked_at: new Date().toISOString(),
  };
  await supabaseAdmin.from('integration_health_snapshots').upsert(snapshot, { onConflict: 'org_id,provider' }).then(() => undefined, () => undefined);
  const alerts = [] as Array<{ type: string; severity: string; message: string }>;
  if (!snapshot.credentials_ok) alerts.push({ type: 'credentials_unavailable', severity: 'critical', message: 'MightyCall credentials cannot be read.' });
  if (!snapshot.webhook_ok) alerts.push({ type: 'webhook_stale', severity: 'critical', message: 'No healthy MightyCall webhook event was received in the last 24 hours.' });
  if (!snapshot.calls_sync_ok) alerts.push({ type: 'calls_stale', severity: 'warning', message: 'MightyCall call data has not refreshed in the last 24 hours.' });
  for (const alert of alerts) {
    const existing = await supabaseAdmin.from('integration_alerts').select('id').eq('org_id', orgId).eq('provider', 'mightycall').eq('alert_type', alert.type).eq('status', 'open').limit(1).maybeSingle();
    if (existing.data?.id) {
      await supabaseAdmin.from('integration_alerts').update({ severity: alert.severity, message: alert.message, last_seen_at: new Date().toISOString() }).eq('id', existing.data.id);
    } else {
      await supabaseAdmin.from('integration_alerts').insert({ org_id: orgId, provider: 'mightycall', alert_type: alert.type, severity: alert.severity, message: alert.message });
    }
  }
  return { ...snapshot, alerts };
}

router.get('/admin/mightycall/reliability/health', async (req, res) => {
  try {
    const actor = actorId(req);
    if (!actor || !(await isPlatformAdmin(actor))) return res.status(403).json({ error: 'forbidden' });
    const requested = String(req.query.org_id || '').trim();
    const orgIds = requested
      ? [requested]
      : await supabaseAdmin.from('organizations').select('id').limit(500).then((r) => (r.data || []).map((row: any) => String(row.id)));
    res.json({ items: await Promise.all(orgIds.map(healthForOrg)) });
  } catch (error: any) {
    res.status(500).json({ error: 'mightycall_health_failed', detail: error?.message || String(error) });
  }
});

router.post('/admin/mightycall/reliability/reconcile', async (req, res) => {
  try {
    const actor = actorId(req);
    if (!actor || !(await isPlatformAdmin(actor))) return res.status(403).json({ error: 'forbidden' });
    const orgId = String(req.body?.orgId || req.body?.org_id || '').trim();
    if (!orgId) return res.status(400).json({ error: 'org_id_required' });
    const calls = await syncRecentCalls(72, orgId);
    const details = await syncCallDetails(250, orgId);
    const health = await healthForOrg(orgId);
    res.json({ ok: true, calls, ...details, health });
  } catch (error: any) {
    res.status(500).json({ error: 'mightycall_reconcile_failed', detail: error?.message || String(error) });
  }
});

router.get('/internal/mightycall/reconcile', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || '';
    const supplied = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!secret || supplied !== secret) return res.status(401).json({ error: 'invalid_cron_authentication' });
    const due = await supabaseAdmin.from('mightycall_webhook_inbox')
      .select('id, org_id, payload_encrypted, attempts')
      .eq('status', 'failed').lte('next_attempt_at', new Date().toISOString()).lt('attempts', 5).limit(50);
    const replayResults: Array<{ id: string; ok: boolean }> = [];
    const origin = `${req.protocol}://${req.get('host')}`;
    for (const item of due.data || []) {
      try {
        const query = item.org_id ? `?org_id=${encodeURIComponent(String(item.org_id))}` : '';
        const response = await fetch(`${origin}/api/webhooks/mightycall${query}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.MIGHTYCALL_WEBHOOK_SECRET || '' },
          body: JSON.stringify(decryptObj(String(item.payload_encrypted || ''))),
        });
        replayResults.push({ id: String(item.id), ok: response.ok });
      } catch {
        replayResults.push({ id: String(item.id), ok: false });
      }
    }
    const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id').limit(100);
    if (error) throw error;
    const results = [];
    for (const org of orgs || []) {
      const orgId = String((org as any).id);
      try {
        const calls = await syncRecentCalls(72, orgId);
        results.push({ org_id: orgId, ok: true, calls, health: await healthForOrg(orgId) });
      } catch (failure: any) {
        results.push({ org_id: orgId, ok: false, error: String(failure?.message || failure).slice(0, 200) });
      }
    }
    res.json({ ok: results.every((item) => item.ok) && replayResults.every((item) => item.ok), replay_results: replayResults, results });
  } catch (error: any) {
    res.status(500).json({ error: 'scheduled_reconcile_failed', detail: error?.message || String(error) });
  }
});

router.post('/recordings/:id/archive', async (req, res) => {
  try {
    const { data: recording, error } = await supabaseAdmin.from('mightycall_recordings').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!recording) return res.status(404).json({ error: 'recording_not_found' });
    if (!(await canAccessOrg(req, String(recording.org_id)))) return res.status(403).json({ error: 'forbidden' });
    const credentials = await orgCredentials(String(recording.org_id));
    const token = await getMightyCallAccessToken(credentials);
    const callId = String(recording.external_call_id || recording.call_id || recording.external_id || '');
    const detail = callId ? await fetchMightyCallCallDetail(token, callId, credentials.clientId) : null;
    const recordingUrl = findRecordingUrl(detail) || recording.recording_url;
    if (!recordingUrl) return res.status(422).json({ error: 'recording_url_unavailable' });
    const remote = await fetch(recordingUrl, { headers: { Authorization: `Bearer ${token}`, 'x-api-key': credentials.clientId } });
    if (!remote.ok) return res.status(502).json({ error: 'recording_provider_fetch_failed', provider_status: remote.status });
    const bytes = Buffer.from(await remote.arrayBuffer());
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const path = `${recording.org_id}/${new Date().toISOString().slice(0, 10)}/${recording.id}.audio`;
    await supabaseAdmin.storage.createBucket('mightycall-recordings', { public: false }).catch(() => undefined);
    const upload = await supabaseAdmin.storage.from('mightycall-recordings').upload(path, bytes, { contentType: remote.headers.get('content-type') || 'audio/mpeg', upsert: true });
    if (upload.error) throw upload.error;
    const consent = await supabaseAdmin.from('recording_consents').select('consent_status').eq('org_id', recording.org_id).eq('external_call_id', callId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const archive = await supabaseAdmin.from('recording_archives').upsert({
      org_id: recording.org_id,
      recording_id: recording.id,
      external_call_id: callId,
      storage_path: path,
      content_type: remote.headers.get('content-type') || 'audio/mpeg',
      byte_size: bytes.length,
      checksum_sha256: checksum,
      consent_status: consent.data?.consent_status || 'unknown',
      retention_until: req.body?.retention_until || null,
      metadata: { source: 'mightycall', archived_by: actorId(req) },
    }, { onConflict: 'org_id,storage_path' }).select().maybeSingle();
    if (archive.error) throw archive.error;
    await supabaseAdmin.from('recording_access_logs').insert({ org_id: recording.org_id, recording_id: String(recording.id), actor_id: actorId(req) || null, action: 'archive', request_id: (req as any).requestId || null });
    res.json({ archive: archive.data });
  } catch (error: any) {
    res.status(500).json({ error: 'recording_archive_failed', detail: error?.message || String(error) });
  }
});

router.put('/recordings/:id/consent', async (req, res) => {
  try {
    const { data: recording } = await supabaseAdmin.from('mightycall_recordings').select('id, org_id, external_call_id, call_id').eq('id', req.params.id).maybeSingle();
    if (!recording) return res.status(404).json({ error: 'recording_not_found' });
    if (!(await canAccessOrg(req, String(recording.org_id)))) return res.status(403).json({ error: 'forbidden' });
    const status = String(req.body?.consent_status || 'unknown');
    if (!['unknown','granted','denied','not_required'].includes(status)) return res.status(400).json({ error: 'invalid_consent_status' });
    const row = await supabaseAdmin.from('recording_consents').insert({
      org_id: recording.org_id,
      external_call_id: recording.external_call_id || recording.call_id || null,
      consent_status: status,
      consent_method: req.body?.consent_method || null,
      consented_at: req.body?.consented_at || (status === 'granted' ? new Date().toISOString() : null),
      evidence: req.body?.evidence || {},
    }).select().maybeSingle();
    if (row.error) throw row.error;
    res.json({ consent: row.data });
  } catch (error: any) {
    res.status(500).json({ error: 'recording_consent_failed', detail: error?.message || String(error) });
  }
});

router.get('/calls/:externalCallId/intelligence', async (req, res) => {
  try {
    const orgId = String(req.query.org_id || '').trim();
    if (!orgId || !(await canAccessOrg(req, orgId))) return res.status(403).json({ error: 'forbidden' });
    const { data, error } = await supabaseAdmin.from('call_intelligence').select('*').eq('org_id', orgId).eq('external_call_id', req.params.externalCallId).maybeSingle();
    if (error) throw error;
    res.json({ intelligence: data || null });
  } catch (error: any) {
    res.status(500).json({ error: 'call_intelligence_failed', detail: error?.message || String(error) });
  }
});

router.put('/calls/:externalCallId/intelligence', async (req, res) => {
  try {
    const orgId = String(req.body?.org_id || req.body?.orgId || '').trim();
    if (!orgId || !(await canAccessOrg(req, orgId))) return res.status(403).json({ error: 'forbidden' });
    const duration = Math.max(Number(req.body?.duration_seconds || 0), 0);
    const qualityScore = req.body?.quality_score == null
      ? Math.min(100, Math.round((duration > 30 ? 40 : 20) + (req.body?.disposition ? 30 : 0) + (req.body?.notes ? 30 : 0)))
      : Math.min(100, Math.max(0, Number(req.body.quality_score)));
    const row = await supabaseAdmin.from('call_intelligence').upsert({
      org_id: orgId,
      external_call_id: req.params.externalCallId,
      recording_id: req.body?.recording_id || null,
      transcript: req.body?.transcript ?? null,
      transcript_status: req.body?.transcript ? 'completed' : (req.body?.transcript_status || 'not_requested'),
      notes: req.body?.notes ?? null,
      disposition: req.body?.disposition ?? null,
      quality_score: qualityScore,
      quality_breakdown: req.body?.quality_breakdown || { duration_signal: duration > 30, has_disposition: !!req.body?.disposition, has_notes: !!req.body?.notes },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,external_call_id' }).select().maybeSingle();
    if (row.error) throw row.error;
    res.json({ intelligence: row.data });
  } catch (error: any) {
    res.status(500).json({ error: 'call_intelligence_save_failed', detail: error?.message || String(error) });
  }
});

export default router;
