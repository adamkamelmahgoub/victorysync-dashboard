import express from 'express';
import { isOrgMember, isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import {
  runLiveStatusSync,
  runMightyCallSync,
  syncCallDetails,
  syncRecentCalls,
  syncSmsIfApiSupported,
  syncTransfersFromCallDetailsIfAvailable,
} from '../mightycall/sync';
import {
  syncMightyCallCallHistory,
  syncMightyCallRecordings,
  syncMightyCallReports,
  syncMightyCallSMS,
} from '../integrations/mightycall';

const router = express.Router();
let lastInlineLiveRefreshAt = 0;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timeout));
  });
}

async function refreshLiveStatusInline(reason: string) {
  const now = Date.now();
  if (now - lastInlineLiveRefreshAt < 4_000) return;
  lastInlineLiveRefreshAt = now;
  await withTimeout(runLiveStatusSync(reason), 7_000, null as any);
  await withTimeout(syncRecentCalls(2), 7_000, 0);
}

async function getActor(req: express.Request) {
  const actorId = req.header('x-user-id') || (req as any).actorId || null;
  if (!actorId) {
    const err = new Error('unauthenticated') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return String(actorId);
}

async function getUserOrgIds(actorId: string) {
  const { data, error } = await supabaseAdmin.from('org_users').select('org_id').eq('user_id', actorId);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => String(row.org_id)).filter(Boolean)));
}

async function getLiveStatusOrgIds() {
  const rows: any[] = [];
  const live = await Promise.resolve(supabaseAdmin.from('agent_live_status').select('org_id').not('org_id', 'is', null).limit(1000)).then((r) => r.data || []).catch(() => []);
  const users = await Promise.resolve(supabaseAdmin.from('org_users').select('org_id').not('mightycall_extension', 'is', null).limit(5000)).then((r) => r.data || []).catch(() => []);
  const members = await Promise.resolve(supabaseAdmin.from('org_members').select('org_id').not('mightycall_extension', 'is', null).limit(5000)).then((r) => r.data || []).catch(() => []);
  rows.push(...live, ...users, ...members);
  return Array.from(new Set(rows.map((row: any) => String(row.org_id)).filter(Boolean)));
}

async function resolveOrgScope(req: express.Request) {
  const actorId = await getActor(req);
  const requestedOrgId = String(req.query.org_id || req.body?.orgId || req.body?.org_id || '').trim();
  const admin = await isPlatformAdmin(actorId);
  if (admin) return { actorId, admin, orgIds: requestedOrgId ? [requestedOrgId] : await getLiveStatusOrgIds() };
  const orgIds = await getUserOrgIds(actorId);
  if (requestedOrgId) {
    if (!orgIds.includes(requestedOrgId)) {
      const err = new Error('forbidden') as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    return { actorId, admin, orgIds: [requestedOrgId] };
  }
  return { actorId, admin, orgIds: orgIds.slice(0, 1) };
}

async function getSyncOrgIds(req: express.Request) {
  const actorId = await getActor(req);
  const requestedOrgId = String(req.query.org_id || req.body?.orgId || req.body?.org_id || '').trim();
  const admin = await isPlatformAdmin(actorId);
  if (requestedOrgId) {
    if (!admin && !(await isOrgMember(actorId, requestedOrgId))) {
      const err = new Error('forbidden') as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    return { actorId, admin, orgIds: [requestedOrgId] };
  }
  if (admin) {
    const { data, error } = await supabaseAdmin.from('organizations').select('id').limit(100);
    if (error) throw error;
    return { actorId, admin, orgIds: (data || []).map((row: any) => String(row.id)).filter(Boolean) };
  }
  return { actorId, admin, orgIds: (await getUserOrgIds(actorId)).slice(0, 1) };
}

async function getOrgPhoneIds(orgId: string) {
  try {
    const { data, error } = await supabaseAdmin.from('org_phone_numbers').select('phone_number_id').eq('org_id', orgId).limit(1000);
    if (!error) {
      const ids = (data || []).map((row: any) => String(row.phone_number_id || '')).filter(Boolean);
      if (ids.length > 0) return ids;
    }
  } catch {}
  try {
    const { data } = await supabaseAdmin.from('phone_numbers').select('id').eq('org_id', orgId).limit(1000);
    return (data || []).map((row: any) => String(row.id)).filter(Boolean);
  } catch {
    return [];
  }
}

function syncDateRange(req: express.Request) {
  const end = String(req.query.end_date || req.body?.endDate || req.body?.end_date || new Date().toISOString().slice(0, 10));
  const start = String(
    req.query.start_date ||
    req.body?.startDate ||
    req.body?.start_date ||
    new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  );
  return { start: start.slice(0, 10), end: end.slice(0, 10) };
}

async function runLegacyJournalSync(req: express.Request, options: { includeReports?: boolean; includeCalls?: boolean; includeRecordings?: boolean; includeSms?: boolean } = {}) {
  const scope = await getSyncOrgIds(req);
  const { start, end } = syncDateRange(req);
  const result = {
    orgsSynced: 0,
    reportsSynced: 0,
    callsSynced: 0,
    recordingsSynced: 0,
    smsSynced: 0,
    skippedUnowned: 0,
    quarantined: 0,
    warnings: [] as string[],
  };
  for (const orgId of scope.orgIds) {
    const phoneIds = await getOrgPhoneIds(orgId);
    try {
      if (options.includeReports !== false) {
        const reports = await syncMightyCallReports(supabaseAdmin, orgId, phoneIds, start, end);
        result.reportsSynced += reports.reportsSynced || 0;
        result.recordingsSynced += reports.recordingsSynced || 0;
        result.skippedUnowned += (reports as any).skippedUnowned || 0;
        result.quarantined += (reports as any).quarantined || 0;
      }
      if (options.includeCalls !== false) {
        const calls = await syncMightyCallCallHistory(supabaseAdmin, orgId, { dateStart: start, dateEnd: end });
        result.callsSynced += calls.callsSynced || 0;
      }
      if (options.includeRecordings) {
        const recordings = await syncMightyCallRecordings(supabaseAdmin, orgId, phoneIds, start, end);
        result.recordingsSynced += recordings.recordingsSynced || 0;
        result.skippedUnowned += recordings.skippedUnowned || 0;
        result.quarantined += recordings.quarantined || 0;
      }
      if (options.includeSms !== false) {
        const sms = await syncMightyCallSMS(supabaseAdmin, orgId);
        result.smsSynced += sms.smsSynced || 0;
        result.skippedUnowned += sms.skippedUnowned || 0;
        result.quarantined += sms.quarantined || 0;
      }
      result.orgsSynced += 1;
    } catch (err: any) {
      result.warnings.push(`${orgId}: ${err?.message || String(err)}`);
    }
  }
  return result;
}

function liveStatusLabel(status: string) {
  switch (status) {
    case 'ringing': return 'Ringing';
    case 'dialing': return 'Dialing';
    case 'on_call': return 'On Call';
    case 'on_hold': return 'On Hold';
    case 'transferring': return 'Transferring';
    case 'available': return 'Available';
    case 'offline': return 'Offline';
    case 'dnd': return 'Do Not Disturb';
    default: return status || 'Unknown';
  }
}

function mapLiveRow(row: any, orgNames: Map<string, string>, identityByKey: Map<string, any>) {
  const status = String(row.normalized_status || row.status || 'unknown').toLowerCase();
  const active = ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(status);
  const direction = row.current_call_direction || row.direction || null;
  const counterpart = direction === 'outbound'
    ? (row.to_number || row.current_counterpart_number || null)
    : (row.from_number || row.current_counterpart_number || null);
  const extension = row.mightycall_extension || row.extension || null;
  const identity = identityByKey.get(`${row.org_id}:${extension}`) || {};
  return {
    user_id: row.user_id || identity.user_id || '',
    org_id: row.org_id || null,
    organization_name: orgNames.get(String(row.org_id || '')) || null,
    email: identity.email || row.raw_payload?.assignment?.email || null,
    role: identity.role || 'agent',
    extension,
    display_name: row.agent_name || identity.display_name || row.raw_payload?.userInfo?.displayName || row.raw_payload?.userInfo?.name || null,
    on_call: active,
    status: liveStatusLabel(status),
    raw_status: row.raw_status || null,
    direction: active ? direction : null,
    from_number: active ? row.from_number || null : null,
    to_number: active ? row.to_number || null : null,
    business_number: row.business_number || null,
    counterpart: active ? counterpart : null,
    started_at: active ? (row.status_started_at || row.started_at || null) : null,
    answered_at: row.answered_at || null,
    ended_at: row.ended_at || null,
    last_seen_at: row.last_synced_at || row.last_event_at || row.updated_at || null,
    refreshed_at: row.last_synced_at || row.updated_at || null,
    stale: false,
    source: row.source || 'mightycall_api_poll',
    api_source: 'local_db_api_poll',
  };
}

async function loadAssignedExtensionRows(orgIds: string[]) {
  if (orgIds.length === 0) return [];
  const [orgUsers, orgMembers] = await Promise.all([
    Promise.resolve(supabaseAdmin.from('org_users').select('id, org_id, user_id, role, mightycall_extension').in('org_id', orgIds).not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
    Promise.resolve(supabaseAdmin.from('org_members').select('id, org_id, user_id, role, mightycall_extension').in('org_id', orgIds).not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
  ]);
  const rows = [...(orgUsers as any[]), ...(orgMembers as any[])].filter((row) => String(row?.mightycall_extension || '').trim());
  const userIds = Array.from(new Set(rows.map((row) => String(row.user_id || '')).filter(Boolean)));
  const profiles = userIds.length
    ? await Promise.resolve(supabaseAdmin.from('profiles').select('id, email, full_name').in('id', userIds)).then((r) => r.data || []).catch(() => [])
    : [];
  const profileById = new Map((profiles as any[]).map((row) => [String(row.id), row]));
  const authEmailById = new Map<string, string>();
  for (const userId of userIds) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = data?.user?.email || '';
      if (email) authEmailById.set(userId, email);
    } catch {}
  }
  const byKey = new Map<string, any>();
  for (const row of rows) {
    const extension = String(row.mightycall_extension || '').replace(/\D/g, '');
    if (!extension) continue;
    const profile = row.user_id ? profileById.get(String(row.user_id)) : null;
    const email = profile?.email || (row.user_id ? authEmailById.get(String(row.user_id)) : null) || null;
    const displayName = profile?.full_name || (email ? String(email).split('@')[0] : null);
    const key = `${row.org_id}:${extension}`;
    if (!byKey.has(key) || row.id) {
      byKey.set(key, {
        org_id: row.org_id,
        user_id: row.user_id || null,
        extension,
        email,
        display_name: displayName,
        role: row.role || 'agent',
      });
    }
  }
  return Array.from(byKey.values());
}

function assignmentToLiveRow(row: any) {
  const now = new Date().toISOString();
  return {
    org_id: row.org_id,
    user_id: row.user_id,
    mightycall_extension: row.extension,
    extension: row.extension,
    agent_name: row.display_name,
    normalized_status: 'unknown',
    status: 'unknown',
    raw_status: 'No MightyCall status synced yet',
    last_synced_at: null,
    last_event_at: null,
    updated_at: now,
    source: 'assignment_roster',
  };
}

router.get('/live-status', async (req, res) => {
  try {
    const scope = await resolveOrgScope(req);
    if (scope.orgIds.length === 0) return res.json({ items: [], refreshed_at: new Date().toISOString(), source: 'local_db_api_poll' });
    await refreshLiveStatusInline('live-status-read');
    const assignments = await loadAssignedExtensionRows(scope.orgIds);
    const identityByKey = new Map(assignments.map((row: any) => [`${row.org_id}:${row.extension}`, row]));
    const { data, error } = await supabaseAdmin
      .from('agent_live_status')
      .select('*')
      .in('org_id', scope.orgIds)
      .order('mightycall_extension', { ascending: true });
    if (error) throw error;
    const { data: orgs } = await supabaseAdmin.from('organizations').select('id, name').in('id', scope.orgIds);
    const orgNames = new Map((orgs || []).map((row: any) => [String(row.id), String(row.name || '')]));
    const liveByKey = new Map((data || []).map((row: any) => [`${row.org_id}:${String(row.mightycall_extension || row.extension || '').replace(/\D/g, '')}`, row]));
    for (const assignment of assignments) {
      const key = `${assignment.org_id}:${assignment.extension}`;
      if (!liveByKey.has(key)) liveByKey.set(key, assignmentToLiveRow(assignment));
    }
    const items = Array.from(liveByKey.values()).map((row: any) => mapLiveRow(row, orgNames, identityByKey));
    const refreshedAt = items.map((item: any) => item.refreshed_at).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
    res.json({
      items,
      refreshed_at: refreshedAt,
      source: 'local_db_api_poll',
      live_status_version: 'api-only-db-read',
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'live_status_failed' });
  }
});

router.post('/live-status/sync', async (req, res) => {
  try {
    await getActor(req);
    const result: any = await runLiveStatusSync('manual-live-status');
    const recentCalls = await withTimeout(syncRecentCalls(2), 8_000, 0);
    res.json({
      ...result,
      syncedCalls: (result.syncedCalls || 0) + recentCalls,
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'live_status_sync_failed' });
  }
});

router.post('/mightycall/sync', async (req, res) => {
  try {
    await getSyncOrgIds(req);
    const [apiResult, journalResult] = await Promise.all([
      runMightyCallSync('manual-full-sync'),
      runLegacyJournalSync(req, { includeReports: true, includeCalls: false, includeRecordings: false, includeSms: true }),
    ]);
    res.json({
      ...apiResult,
      journal: journalResult,
      syncedCalls: (apiResult.syncedCalls || 0) + journalResult.callsSynced,
      syncedRecordings: (apiResult.syncedRecordings || 0) + journalResult.recordingsSynced,
      syncedSms: (apiResult.syncedSms || 0) + journalResult.smsSynced,
      warnings: [...(apiResult.warnings || []), ...journalResult.warnings],
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_sync_failed' });
  }
});

router.post('/mightycall/sync/recordings', async (req, res) => {
  try {
    await getSyncOrgIds(req);
    const [journal, details] = await Promise.all([
      runLegacyJournalSync(req, { includeReports: false, includeCalls: false, includeRecordings: true, includeSms: false }),
      syncRecentCalls(168).then(() => syncCallDetails(100)),
    ]);
    res.json({
      ok: true,
      recordings_synced: details.recordings + journal.recordingsSynced,
      call_details_synced: details.details,
      transfers_synced: details.transfers,
      journal,
      source: 'mightycall_api_call_details_and_journal',
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_recordings_sync_failed' });
  }
});

router.post('/mightycall/sync/sms', async (req, res) => {
  try {
    await getSyncOrgIds(req);
    const [result, journal] = await Promise.all([
      syncSmsIfApiSupported(),
      runLegacyJournalSync(req, { includeReports: true, includeCalls: false, includeRecordings: false, includeSms: true }),
    ]);
    res.json({
      ok: true,
      sms_synced: result.synced + journal.smsSynced,
      smsSupported: result.supported,
      reason: result.reason,
      journal,
      source: result.supported ? 'mightycall_api_and_journal' : 'mightycall_journal_or_local_db',
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_sms_sync_failed' });
  }
});

router.post('/mightycall/sync/transfers', async (req, res) => {
  try {
    const actorId = await getActor(req);
    const orgId = String(req.query.org_id || req.body?.orgId || req.body?.org_id || '').trim();
    if (orgId && !(await isPlatformAdmin(actorId)) && !(await isOrgMember(actorId, orgId))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const transfers = await syncTransfersFromCallDetailsIfAvailable();
    res.json({ ok: true, transfers_synced: transfers, source: 'mightycall_api_call_details' });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_transfers_sync_failed' });
  }
});

export default router;
