import express from 'express';
import { isOrgMember, isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import {
  getMightyCallBackgroundSyncStatus,
  runLiveStatusSync,
  runMightyCallSync,
  syncCallDetails,
  syncRecentCalls,
  syncSmsIfApiSupported,
  syncTransfersFromCallDetailsIfAvailable,
} from '../mightycall/sync';
import { getMightyCallStatusByExtension } from '../services/mightycallLiveStatus';
import {
  syncMightyCallPhoneNumbers,
  syncMightyCallCallHistory,
  syncMightyCallRecordings,
  syncMightyCallReports,
  syncMightyCallSMS,
} from '../integrations/mightycall';

const router = express.Router();
let lastInlineLiveRefreshAt = 0;
let lastInlineLiveRefreshResult: any = null;

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
  lastInlineLiveRefreshAt = now;
  const statusResult = await withTimeout(runLiveStatusSync(reason), 7_000, { ok: false, timeout: true, warnings: ['MightyCall status refresh timed out'] } as any);
  const recentCalls = await withTimeout(syncRecentCalls(2), 7_000, 0);
  lastInlineLiveRefreshResult = {
    ...(statusResult || {}),
    syncedCalls: ((statusResult as any)?.syncedCalls || 0) + recentCalls,
    source: 'mightycall_api_live_refresh',
    refreshed_at: new Date().toISOString(),
  };
  return lastInlineLiveRefreshResult;
}

async function getActor(req: express.Request) {
  const actorId = (req as any).actorId || req.header('x-user-id') || null;
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
  const phoneNumbers = await Promise.resolve(supabaseAdmin.from('phone_numbers').select('org_id').not('org_id', 'is', null).limit(5000)).then((r) => r.data || []).catch(() => []);
  const orgPhones = await Promise.resolve(supabaseAdmin.from('org_phone_numbers').select('org_id').not('org_id', 'is', null).limit(5000)).then((r) => r.data || []).catch(() => []);
  const integrations = await Promise.resolve(supabaseAdmin.from('org_integrations').select('org_id').eq('provider', 'mightycall').limit(1000)).then((r) => r.data || []).catch(() => []);
  const organizations = await Promise.resolve(supabaseAdmin.from('organizations').select('id').limit(1000)).then((r) => (r.data || []).map((row: any) => ({ org_id: row.id }))).catch(() => []);
  rows.push(...live, ...users, ...members, ...phoneNumbers, ...orgPhones, ...integrations, ...organizations);
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

async function getMightyCallCredentialOverride(orgId: string) {
  try {
    const { getOrgIntegration } = await import('../lib/integrationsStore');
    const integ = await getOrgIntegration(orgId, 'mightycall');
    const credentials = integ?.credentials || null;
    if (!credentials) return undefined;
    return {
      clientId: credentials.clientId || credentials.apiKey || undefined,
      clientSecret: credentials.clientSecret || credentials.userKey || undefined,
      baseUrl: credentials.baseUrl || credentials.apiBaseUrl || undefined,
    };
  } catch {
    return undefined;
  }
}

type SyncJobRef = { id: string; table: 'integration_sync_jobs' | 'mightycall_sync_runs' } | null;

async function createOrgSyncJob(orgId: string, integrationType: string, metadata: Record<string, any> = {}): Promise<SyncJobRef> {
  try {
    const { data, error } = await supabaseAdmin
      .from('integration_sync_jobs')
      .insert({
        org_id: orgId,
        integration_type: integrationType,
        status: 'running',
        started_at: new Date().toISOString(),
        records_processed: 0,
        metadata,
      })
      .select('id')
      .maybeSingle();
    if (!error && data?.id) return { id: String(data.id), table: 'integration_sync_jobs' };
  } catch {}

  try {
    const { data, error } = await supabaseAdmin
      .from('mightycall_sync_runs')
      .insert({
        org_id: orgId,
        sync_type: integrationType,
        status: 'running',
        started_at: new Date().toISOString(),
        detail: metadata,
      })
      .select('id')
      .maybeSingle();
    if (!error && data?.id) return { id: String(data.id), table: 'mightycall_sync_runs' };
  } catch {}

  return null;
}

async function finishOrgSyncJob(job: SyncJobRef, updates: { status: 'completed' | 'failed'; recordsProcessed?: number; errorMessage?: string | null; metadata?: Record<string, any> }) {
  if (!job) return;
  if (job.table === 'integration_sync_jobs') {
    await supabaseAdmin
      .from('integration_sync_jobs')
      .update({
        status: updates.status,
        completed_at: new Date().toISOString(),
        records_processed: updates.recordsProcessed || 0,
        error_message: updates.errorMessage || null,
        metadata: updates.metadata || {},
      })
      .eq('id', job.id);
    return;
  }
  await supabaseAdmin
    .from('mightycall_sync_runs')
    .update({
      status: updates.status,
      finished_at: new Date().toISOString(),
      detail: {
        ...(updates.metadata || {}),
        records_processed: updates.recordsProcessed || 0,
        error_message: updates.errorMessage || null,
      },
    })
    .eq('id', job.id);
}

function syncDateRange(req: express.Request) {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const end = String(req.query.end_date || req.body?.endDate || req.body?.end_date || new Date().toISOString().slice(0, 10));
  const start = String(
    req.query.start_date ||
    req.body?.startDate ||
    req.body?.start_date ||
    fiveYearsAgo.toISOString().slice(0, 10)
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
    const overrideCreds = await getMightyCallCredentialOverride(orgId);
    const job = await createOrgSyncJob(orgId, 'mightycall_manual_sync', { start_date: start, end_date: end });
    try {
      const phoneSync = await syncMightyCallPhoneNumbers(supabaseAdmin, orgId, [], overrideCreds);
      const phoneIds = await getOrgPhoneIds(orgId);
      let orgRecordsProcessed = Number(phoneSync?.upserted || phoneSync?.synced || 0);
      if (options.includeReports !== false) {
        const reports = await syncMightyCallReports(supabaseAdmin, orgId, phoneIds, start, end, overrideCreds);
        result.reportsSynced += reports.reportsSynced || 0;
        result.callsSynced += (reports as any).callsSynced || 0;
        result.recordingsSynced += reports.recordingsSynced || 0;
        result.skippedUnowned += (reports as any).skippedUnowned || 0;
        result.quarantined += (reports as any).quarantined || 0;
        orgRecordsProcessed += Number(reports.reportsSynced || 0) + Number(reports.recordingsSynced || 0);
      }
      if (options.includeCalls !== false) {
        const calls = await syncMightyCallCallHistory(supabaseAdmin, orgId, { dateStart: start, dateEnd: end }, overrideCreds);
        result.callsSynced += calls.callsSynced || 0;
        orgRecordsProcessed += Number(calls.callsSynced || 0);
      }
      if (options.includeRecordings) {
        const recordings = await syncMightyCallRecordings(supabaseAdmin, orgId, phoneIds, start, end, overrideCreds);
        result.recordingsSynced += recordings.recordingsSynced || 0;
        result.skippedUnowned += recordings.skippedUnowned || 0;
        result.quarantined += recordings.quarantined || 0;
        orgRecordsProcessed += Number(recordings.recordingsSynced || 0);
      }
      if (options.includeSms !== false) {
        const sms = await syncMightyCallSMS(supabaseAdmin, orgId, overrideCreds);
        result.smsSynced += sms.smsSynced || 0;
        result.skippedUnowned += sms.skippedUnowned || 0;
        result.quarantined += sms.quarantined || 0;
        orgRecordsProcessed += Number(sms.smsSynced || 0);
      }
      result.orgsSynced += 1;
      await finishOrgSyncJob(job, {
        status: 'completed',
        recordsProcessed: orgRecordsProcessed,
        metadata: { start_date: start, end_date: end, ...result },
      });
    } catch (err: any) {
      const message = `${orgId}: ${err?.message || String(err)}`;
      result.warnings.push(message);
      await finishOrgSyncJob(job, {
        status: 'failed',
        errorMessage: err?.message || String(err),
        metadata: { start_date: start, end_date: end, warnings: [message] },
      });
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
  const extensionStatus = row.raw_payload?.extensionStatus || {};
  const counterpart = direction === 'outbound'
    ? (row.to_number || row.current_counterpart_number || null)
    : (row.from_number || row.current_counterpart_number || null);
  const extension = row.mightycall_extension || row.extension || null;
  const identity = identityByKey.get(`${row.org_id}:${extension}`) || {};
  return {
    user_id: row.user_id || identity.user_id || '',
    org_id: row.org_id || null,
    organization_name: orgNames.get(String(row.org_id || '')) || null,
    email: identity.email || extensionStatus.email || row.raw_payload?.mightycallEmail || row.raw_payload?.assignment?.email || null,
    role: identity.role || 'agent',
    extension,
    display_name: row.agent_name || extensionStatus.name || identity.display_name || row.raw_payload?.userInfo?.displayName || row.raw_payload?.userInfo?.name || null,
    on_call: active,
    status: liveStatusLabel(status),
    normalized_status: status,
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
    api_source: row.source || 'mightycall_api_poll',
    decision_reason: extensionStatus.decisionReason || row.raw_payload?.resolverRaw?.decisionReason || null,
    source_endpoint: row.raw_payload?.resolverRaw?.profileStatus?.sourceEndpoint || null,
    current_call_id: active ? row.current_call_id || null : null,
    evidence_age_ms: extensionStatus.evidenceAgeMs ?? row.raw_payload?.resolverRaw?.activeEvidenceAgeMs ?? null,
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

function resolverStatusToLiveRow(assignment: any, status: any) {
  const now = new Date().toISOString();
  const normalized = status?.normalizedStatus === 'unknown' ? 'available' : (status?.normalizedStatus || 'unknown');
  const active = ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(normalized);
  return {
    org_id: assignment.org_id,
    user_id: assignment.user_id,
    mightycall_user_id: status?.mightycallUserId || null,
    mightycall_extension: assignment.extension,
    extension: assignment.extension,
    agent_name: status?.name || assignment.display_name || assignment.email || null,
    normalized_status: normalized,
    status: normalized,
    raw_status: status?.rawStatus || normalized,
    current_call_id: active ? status?.currentCallId || null : null,
    current_call_direction: active ? status?.direction || null : null,
    direction: active ? status?.direction || null : null,
    from_number: active && status?.direction === 'inbound' ? status?.counterpartNumber || null : null,
    to_number: active && status?.direction === 'outbound' ? status?.counterpartNumber || null : null,
    current_counterpart_number: active ? status?.counterpartNumber || null : null,
    status_started_at: active ? status?.statusStartedAt || null : null,
    started_at: active ? status?.statusStartedAt || null : null,
    last_synced_at: status?.lastSyncedAt || now,
    last_event_at: status?.lastSyncedAt || now,
    updated_at: now,
    source: status?.source || 'mightycall_user_status_by_extension',
    raw_payload: {
      assignment,
      extensionStatus: status,
      mightycallEmail: status?.email || null,
      resolverRaw: status?.raw || null,
    },
  };
}

async function loadDirectMightyCallStatuses(assignments: any[]) {
  if (assignments.length === 0) return { rows: [] as any[], warnings: [] as string[] };
  const warnings: string[] = [];
  const limited = assignments.slice(0, 25);
  const rows = await Promise.all(limited.map(async (assignment) => {
    try {
      const status = await withTimeout(
        getMightyCallStatusByExtension({ extension: assignment.extension, orgId: assignment.org_id }),
        5500,
        null as any
      );
      return status ? resolverStatusToLiveRow(assignment, status) : null;
    } catch (err: any) {
      warnings.push(`${assignment.extension}: ${err?.message || String(err)}`);
      return null;
    }
  }));
  if (assignments.length > limited.length) warnings.push(`Live status direct refresh limited to ${limited.length} assigned extensions`);
  return { rows: rows.filter(Boolean), warnings };
}

function liveRowStatus(row: any) {
  return String(row?.normalized_status || row?.status || '').toLowerCase();
}

function liveRowIsActive(row: any) {
  return ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(liveRowStatus(row));
}

function liveRowTimestampMs(row: any) {
  const parsed = Date.parse(String(row?.last_synced_at || row?.updated_at || row?.last_event_at || row?.status_started_at || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadCachedLiveStatusRows(orgIds: string[]) {
  if (orgIds.length === 0) return [];
  const rows: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('agent_live_status')
      .select('*')
      .in('org_id', orgIds)
      .limit(2000);
    rows.push(...((data || []) as any[]));
  } catch {}
  try {
    const { data } = await supabaseAdmin
      .from('live_agent_statuses')
      .select('*')
      .in('org_id', orgIds)
      .limit(2000);
    rows.push(...((data || []) as any[]).map((row: any) => ({
      ...row,
      mightycall_extension: row.mightycall_extension || row.extension,
      normalized_status: row.normalized_status || row.status,
      last_synced_at: row.last_synced_at || row.last_seen_at || row.updated_at,
      source: row.source || 'live_agent_statuses_cache',
    })));
  } catch {}

  const byKey = new Map<string, any>();
  for (const row of rows) {
    const extension = String(row.mightycall_extension || row.extension || '').replace(/\D/g, '');
    if (!row.org_id || !extension) continue;
    const key = `${row.org_id}:${extension}`;
    const current = byKey.get(key);
    if (!current || liveRowTimestampMs(row) >= liveRowTimestampMs(current)) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

async function buildLiveStatusPayload(req: express.Request) {
  const scope = await resolveOrgScope(req);
  if (scope.orgIds.length === 0) {
    return {
      items: [],
      refreshed_at: new Date().toISOString(),
      source: 'mightycall_api_direct',
      api_source: 'mightycall_api_direct',
      direct_warnings: [],
    };
  }

  const assignments = await loadAssignedExtensionRows(scope.orgIds);
  const [cachedRows, direct] = await Promise.all([
    loadCachedLiveStatusRows(scope.orgIds),
    loadDirectMightyCallStatuses(assignments),
  ]);
  const identityByKey = new Map(assignments.map((row: any) => [`${row.org_id}:${row.extension}`, row]));
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id, name').in('id', scope.orgIds);
  const orgNames = new Map((orgs || []).map((row: any) => [String(row.id), String(row.name || '')]));
  const liveByKey = new Map<string, any>();
  for (const row of cachedRows) {
    const key = `${row.org_id}:${String(row.mightycall_extension || row.extension || '').replace(/\D/g, '')}`;
    liveByKey.set(key, row);
  }
  for (const row of direct.rows) {
    const key = `${row.org_id}:${String(row.mightycall_extension || row.extension || '').replace(/\D/g, '')}`;
    const current = liveByKey.get(key);
    const nextIsActive = liveRowIsActive(row);
    const currentIsActive = liveRowIsActive(current);
    const currentFresh = current && Date.now() - liveRowTimestampMs(current) < 45_000;
    if (nextIsActive || !currentIsActive || !currentFresh) liveByKey.set(key, row);
  }
  for (const assignment of assignments) {
    const key = `${assignment.org_id}:${assignment.extension}`;
    if (!liveByKey.has(key)) liveByKey.set(key, assignmentToLiveRow(assignment));
  }

  const items = Array.from(liveByKey.values()).map((row: any) => mapLiveRow(row, orgNames, identityByKey));
  const refreshedAt = items.map((item: any) => item.refreshed_at).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
  return {
    items,
    refreshed_at: refreshedAt,
    source: 'mightycall_api_direct',
    api_source: 'mightycall_api_direct',
    live_status_version: 'mightycall-api-direct-authenticated',
    direct_warnings: direct.warnings,
  };
}

router.get('/live-status', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
      ...(await buildLiveStatusPayload(req)),
      sync: {
        ok: true,
        skipped: true,
        reason: 'direct_extension_status_read',
        refreshed_at: new Date().toISOString(),
      },
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
    const payload = await buildLiveStatusPayload(req);
    res.json({
      ...result,
      syncedCalls: (result.syncedCalls || 0) + recentCalls,
      ...payload,
      sync: {
        ...(result || {}),
        syncedCalls: (result.syncedCalls || 0) + recentCalls,
        refreshed_at: new Date().toISOString(),
      },
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
      runLegacyJournalSync(req, { includeReports: true, includeCalls: true, includeRecordings: true, includeSms: true }),
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

router.get('/mightycall/sync/status', async (req, res) => {
  try {
    await getActor(req);
    res.json({
      ok: true,
      sync: getMightyCallBackgroundSyncStatus(),
      refreshed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_sync_status_failed' });
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
