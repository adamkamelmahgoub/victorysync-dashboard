import { supabaseAdmin } from '../lib/supabaseClient';
import { getMightyCallToken, mightyCallGetFirst } from './client';
import {
  fetchMightyCallLiveCallByExtension,
  syncMightyCallCallHistory,
  syncMightyCallPhoneNumbers,
  syncMightyCallRecordings,
  syncMightyCallReports,
  syncMightyCallSMS,
  syncMightyCallVoicemails,
} from '../integrations/mightycall';
import { getMightyCallStatusByExtension, type MightyCallStatusByExtension } from '../services/mightycallLiveStatus';
import {
  arrayFromApiResponse,
  callLifecycleStatus,
  detectDirectionFromNumbers,
  detectTransferFromCallDetail,
  directionFromText,
  findRecordingUrl,
  firstIso,
  firstNumber,
  firstString,
  liveStatusFromCall,
  normalizeCallStatus,
  normalizeMightyCallStatus,
  normalizePhone,
  normalizePhoneDigits,
  pickDeep,
} from './normalizers';

type SyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason: string;
  syncedUsers: number;
  syncedStatuses: number;
  syncedCalls: number;
  syncedCallDetails: number;
  syncedRecordings: number;
  syncedVoicemails: number;
  syncedSms: number;
  syncedTransfers: number;
  warnings: string[];
  capabilities: {
    smsSupported: boolean;
    smsReason?: string;
    transferDetailsSupported: boolean;
    liveRingingSupported: 'unknown' | 'yes' | 'no';
  };
};

let syncRunning = false;
let statusSyncRunning = false;
let schedulerStarted = false;
let lastStatusSyncAt = 0;
let lastRecentCallsSyncAt = 0;
let lastSlowSyncAt = 0;
let lastPhoneInventorySyncAt = 0;
let lastReportsSyncAt = 0;
let lastSmsSyncAt = 0;
let lastRecordingsSyncAt = 0;
let lastVoicemailSyncAt = 0;
let rollingReportsSyncRunning = false;
let rollingSmsSyncRunning = false;
let rollingRecordingsSyncRunning = false;
let rollingVoicemailSyncRunning = false;
let phoneInventorySyncRunning = false;

type BackgroundSyncStatus = {
  started: boolean;
  running: Record<string, boolean>;
  lastSyncAt: Record<string, string | null>;
  intervalsMs: Record<string, number>;
  lookbackDays: number;
};

function numberFromEnv(name: string, fallback: number, min = 1_000) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= min ? raw : fallback;
}

const POLL_STATUS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_STATUS_SYNC_INTERVAL_MS', 5_000);
const POLL_RECENT_CALLS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_RECENT_CALLS_SYNC_INTERVAL_MS', 15_000);
const POLL_CALL_DETAILS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_CALL_DETAILS_SYNC_INTERVAL_MS', 60_000);
const POLL_PHONE_INVENTORY_INTERVAL_MS = numberFromEnv('MIGHTYCALL_PHONE_INVENTORY_SYNC_INTERVAL_MS', 5 * 60_000);
const POLL_REPORTS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_REPORTS_SYNC_INTERVAL_MS', 2 * 60_000);
const POLL_SMS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_SMS_SYNC_INTERVAL_MS', 60_000);
const POLL_RECORDINGS_INTERVAL_MS = numberFromEnv('MIGHTYCALL_RECORDINGS_SYNC_INTERVAL_MS', 90_000);
const POLL_VOICEMAIL_INTERVAL_MS = numberFromEnv('MIGHTYCALL_VOICEMAIL_SYNC_INTERVAL_MS', 2 * 60_000);
const BACKGROUND_SYNC_LOOKBACK_DAYS = numberFromEnv('MIGHTYCALL_BACKGROUND_SYNC_LOOKBACK_DAYS', 14, 1);
const BACKGROUND_SYNC_MAX_ORGS = numberFromEnv('MIGHTYCALL_BACKGROUND_SYNC_MAX_ORGS', 100, 1);

const CALL_LIST_PATHS = ['/calls', '/call-history', '/callhistory', '/journal/calls', '/journal/requests'];
const CALL_DETAIL_PATHS = ['/calls/{id}', '/call-history/{id}', '/callhistory/{id}', '/journal/calls/{id}', '/journal/requests/{id}', '/requests/{id}'];
const BUSINESS_NUMBER_PATHS = ['/phonenumbers', '/phone_numbers', '/business-numbers', '/businessNumbers'];
const USER_PATHS = ['/users', '/profiles', '/members'];
const USER_STATUS_PATHS = ['/profile/status', '/users/status', '/user/status', '/status'];
const VOICEMAIL_PATHS = ['/voicemails', '/voice-mails', '/voicemail'];
const SMS_PATHS = ['/journal/requests', '/messages', '/sms', '/text-messages', '/journal/messages'];

function emptyResult(reason: string): SyncResult {
  return {
    ok: true,
    reason,
    syncedUsers: 0,
    syncedStatuses: 0,
    syncedCalls: 0,
    syncedCallDetails: 0,
    syncedRecordings: 0,
    syncedVoicemails: 0,
    syncedSms: 0,
    syncedTransfers: 0,
    warnings: [],
    capabilities: {
      smsSupported: false,
      transferDetailsSupported: false,
      liveRingingSupported: 'unknown',
    },
  };
}

function safeWarning(err: any) {
  return String(err?.message || err || 'unknown_error').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getBackgroundSyncOrgIds() {
  const ids = new Set<string>();
  try {
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, status, is_active')
      .limit(BACKGROUND_SYNC_MAX_ORGS);
    for (const row of (data || []) as any[]) {
      const status = String(row?.status || '').toLowerCase();
      if (row?.id && row?.is_active !== false && !['disabled', 'archived', 'inactive'].includes(status)) ids.add(String(row.id));
    }
  } catch {}
  if (ids.size === 0) {
    try {
      const { data } = await supabaseAdmin
        .from('phone_numbers')
        .select('org_id')
        .not('org_id', 'is', null)
        .limit(BACKGROUND_SYNC_MAX_ORGS * 5);
      for (const row of (data || []) as any[]) if (row?.org_id) ids.add(String(row.org_id));
    } catch {}
  }
  return Array.from(ids).slice(0, BACKGROUND_SYNC_MAX_ORGS);
}

async function getPhoneIdsForOrg(orgId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('phone_number_id')
      .eq('org_id', orgId)
      .limit(1000);
    if (!error) {
      const ids = (data || []).map((row: any) => String(row.phone_number_id || '')).filter(Boolean);
      if (ids.length) return ids;
    }
  } catch {}
  try {
    const { data } = await supabaseAdmin
      .from('phone_numbers')
      .select('id')
      .eq('org_id', orgId)
      .limit(1000);
    return (data || []).map((row: any) => String(row.id || '')).filter(Boolean);
  } catch {
    return [];
  }
}

function trackLastSync(kind: keyof BackgroundSyncStatus['lastSyncAt']) {
  const now = Date.now();
  if (kind === 'status') lastStatusSyncAt = now;
  if (kind === 'recentCalls') lastRecentCallsSyncAt = now;
  if (kind === 'callDetails') lastSlowSyncAt = now;
  if (kind === 'phoneInventory') lastPhoneInventorySyncAt = now;
  if (kind === 'reports') lastReportsSyncAt = now;
  if (kind === 'sms') lastSmsSyncAt = now;
  if (kind === 'recordings') lastRecordingsSyncAt = now;
  if (kind === 'voicemails') lastVoicemailSyncAt = now;
}

function lastIso(ms: number) {
  return ms > 0 ? new Date(ms).toISOString() : null;
}

async function withBackgroundLock<T>(lock: 'reports' | 'sms' | 'recordings' | 'voicemails' | 'phoneInventory', job: () => Promise<T>) {
  if (lock === 'reports' && rollingReportsSyncRunning) return null;
  if (lock === 'sms' && rollingSmsSyncRunning) return null;
  if (lock === 'recordings' && rollingRecordingsSyncRunning) return null;
  if (lock === 'voicemails' && rollingVoicemailSyncRunning) return null;
  if (lock === 'phoneInventory' && phoneInventorySyncRunning) return null;
  if (lock === 'reports') rollingReportsSyncRunning = true;
  if (lock === 'sms') rollingSmsSyncRunning = true;
  if (lock === 'recordings') rollingRecordingsSyncRunning = true;
  if (lock === 'voicemails') rollingVoicemailSyncRunning = true;
  if (lock === 'phoneInventory') phoneInventorySyncRunning = true;
  try {
    return await job();
  } finally {
    if (lock === 'reports') rollingReportsSyncRunning = false;
    if (lock === 'sms') rollingSmsSyncRunning = false;
    if (lock === 'recordings') rollingRecordingsSyncRunning = false;
    if (lock === 'voicemails') rollingVoicemailSyncRunning = false;
    if (lock === 'phoneInventory') phoneInventorySyncRunning = false;
  }
}

export function getMightyCallBackgroundSyncStatus(): BackgroundSyncStatus {
  return {
    started: schedulerStarted,
    running: {
      fullApiSync: syncRunning,
      liveStatus: statusSyncRunning,
      reports: rollingReportsSyncRunning,
      sms: rollingSmsSyncRunning,
      recordings: rollingRecordingsSyncRunning,
      voicemails: rollingVoicemailSyncRunning,
      phoneInventory: phoneInventorySyncRunning,
    },
    lastSyncAt: {
      status: lastIso(lastStatusSyncAt),
      recentCalls: lastIso(lastRecentCallsSyncAt),
      callDetails: lastIso(lastSlowSyncAt),
      phoneInventory: lastIso(lastPhoneInventorySyncAt),
      reports: lastIso(lastReportsSyncAt),
      sms: lastIso(lastSmsSyncAt),
      recordings: lastIso(lastRecordingsSyncAt),
      voicemails: lastIso(lastVoicemailSyncAt),
    },
    intervalsMs: {
      status: POLL_STATUS_INTERVAL_MS,
      recentCalls: POLL_RECENT_CALLS_INTERVAL_MS,
      callDetails: POLL_CALL_DETAILS_INTERVAL_MS,
      phoneInventory: POLL_PHONE_INVENTORY_INTERVAL_MS,
      reports: POLL_REPORTS_INTERVAL_MS,
      sms: POLL_SMS_INTERVAL_MS,
      recordings: POLL_RECORDINGS_INTERVAL_MS,
      voicemails: POLL_VOICEMAIL_INTERVAL_MS,
    },
    lookbackDays: BACKGROUND_SYNC_LOOKBACK_DAYS,
  };
}

async function recordSyncRun(result: SyncResult, status: 'running' | 'completed' | 'failed', startedAt: string, finishedAt?: string) {
  try {
    await supabaseAdmin.from('mightycall_sync_runs').insert({
      reason: result.reason,
      status,
      started_at: startedAt,
      finished_at: finishedAt || null,
      synced_users: result.syncedUsers,
      synced_statuses: result.syncedStatuses,
      synced_calls: result.syncedCalls,
      synced_call_details: result.syncedCallDetails,
      synced_recordings: result.syncedRecordings,
      synced_sms: result.syncedSms,
      synced_transfers: result.syncedTransfers,
      error: result.ok ? null : result.warnings.join('; '),
      raw_result: result,
    });
  } catch {
    try {
      await supabaseAdmin.from('mightycall_sync_runs').insert({
        sync_type: `api_only_${result.reason}`,
        status,
        started_at: startedAt,
        finished_at: finishedAt || null,
        detail: result,
      });
    } catch {}
  }
}

async function loadBusinessNumbers() {
  const data = await queryPhoneNumberRows();
  return (data || []).map((row: any) => ({
    id: String(row.id || ''),
    orgId: String(row.org_id || ''),
    number: normalizePhone(row.number || row.e164 || row.phone_number),
    digits: normalizePhoneDigits(row.number_digits || row.number || row.e164 || row.phone_number),
  })).filter((row) => row.orgId && row.digits);
}

async function queryPhoneNumberRows() {
  const selects = [
    'id, org_id, number, number_digits, e164, phone_number',
    'id, org_id, number, phone_number',
    'id, org_id, number',
    'id, org_id, phone_number',
  ];
  let lastError: any = null;
  for (const select of selects) {
    const { data, error } = await supabaseAdmin.from('phone_numbers').select(select);
    if (!error) return data || [];
    lastError = error;
    if (!/number_digits|e164|phone_number|number|schema cache|does not exist/i.test(error.message || '')) throw error;
  }
  throw lastError;
}

async function resolveOrgByBusinessNumber(...values: any[]) {
  const phones = await loadBusinessNumbers();
  const candidateDigits = values.map((value) => normalizePhoneDigits(value)).filter(Boolean);
  for (const digits of candidateDigits) {
    const match = phones.find((phone) => phone.digits === digits);
    if (match) return match;
  }
  return null;
}

async function findExistingPhoneNumber(number: string, digits: string | null) {
  const filters = [
    `number.eq.${number},phone_number.eq.${number}`,
    `number.eq.${number}`,
    `phone_number.eq.${number}`,
    digits ? `number_digits.eq.${digits}` : '',
  ].filter(Boolean);
  let lastError: any = null;
  for (const filter of filters) {
    const { data, error } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, org_id')
      .or(filter)
      .limit(1)
      .maybeSingle();
    if (!error) return data;
    lastError = error;
    if (!/number_digits|phone_number|number|schema cache|does not exist/i.test(error.message || '')) throw error;
  }
  if (lastError) throw lastError;
  return null;
}

async function updateExistingPhoneNumber(id: string, externalId: string, number: string, digits: string | null, raw: any) {
  const label = firstString(raw?.label, raw?.name);
  const updates = [
    { external_id: externalId, number, number_digits: digits, label, metadata: raw, is_active: raw?.isActive !== false },
    { external_id: externalId, number, label, metadata: raw },
    { external_id: externalId, number, label },
    { external_id: externalId, phone_number: number, label },
    { external_id: externalId, label },
  ];
  let lastError: any = null;
  for (const update of updates) {
    const { error } = await supabaseAdmin.from('phone_numbers').update(update).eq('id', id);
    if (!error) return;
    lastError = error;
    if (!/number_digits|phone_number|number|metadata|is_active|schema cache|does not exist/i.test(error.message || '')) throw error;
  }
  if (lastError) throw lastError;
}

async function loadOrgMembersByExtension() {
  const [orgMembers, orgUsers] = await Promise.all([
    Promise.resolve(supabaseAdmin.from('org_members').select('id, org_id, user_id, role, mightycall_extension').not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
    Promise.resolve(supabaseAdmin.from('org_users').select('id, org_id, user_id, role, mightycall_extension').not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
  ]);
  const userIds = Array.from(new Set(([...orgUsers, ...orgMembers] as any[]).map((row) => String(row?.user_id || '')).filter(Boolean)));
  const profiles = userIds.length
    ? await Promise.resolve(supabaseAdmin.from('profiles').select('id, email, full_name').in('id', userIds)).then((r) => r.data || []).catch(() => [])
    : [];
  const profileById = new Map((profiles as any[]).map((row) => [String(row.id), row]));
  const byExtension = new Map<string, any>();
  for (const row of [...orgUsers, ...orgMembers] as any[]) {
    const extension = normalizePhoneDigits(row?.mightycall_extension);
    if (!extension) continue;
    const key = `${row.org_id}:${extension}`;
    const profile = row.user_id ? profileById.get(String(row.user_id)) : null;
    const email = profile?.email || null;
    const name = profile?.full_name || (email ? String(email).split('@')[0] : null);
    byExtension.set(key, {
      orgMemberId: row.id || null,
      orgId: row.org_id,
      userId: row.user_id || null,
      name,
      email,
      role: row.role || 'agent',
      extension,
    });
  }
  return byExtension;
}

function membersForExtension(membersByExt: Map<string, any>, extension: string | null, orgId?: string | null) {
  if (!extension) return [];
  const all = Array.from(membersByExt.values()).filter((row) => row.extension === extension);
  if (!orgId) return all;
  return all.filter((row) => String(row.orgId) === String(orgId));
}

function unwrapApiObject(body: any) {
  if (body && !Array.isArray(body) && body.data && !Array.isArray(body.data) && typeof body.data === 'object') return body.data;
  return body;
}

function normalizeCallRow(raw: any, owner: Awaited<ReturnType<typeof resolveOrgByBusinessNumber>>, businessNumbers: string[]) {
  const externalCallId = firstString(raw?.external_call_id, raw?.externalCallId, raw?.callId, raw?.id, raw?.requestGuid, raw?.guid);
  const fromNumber = normalizePhone(firstString(raw?.from_number, raw?.from, raw?.caller?.number, raw?.client?.address, raw?.source?.number));
  const toNumber = normalizePhone(firstString(raw?.to_number, raw?.to, raw?.called?.[0]?.phone, raw?.businessNumber?.number, raw?.destination?.number));
  const businessNumber = normalizePhone(firstString(raw?.business_number, raw?.businessNumber?.number, raw?.businessNumber, owner?.number, toNumber, fromNumber));
  const explicitDirection = directionFromText(firstString(raw?.direction, raw?.callDirection, raw?.Direction, raw?.origin, raw?.requestOrigin));
  const directionNumbers = Array.from(new Set([...businessNumbers, owner?.number].filter((value): value is string => !!value)));
  const direction = explicitDirection !== 'unknown' ? explicitDirection : detectDirectionFromNumbers(fromNumber, toNumber, directionNumbers);
  const extension = normalizePhoneDigits(firstString(
    raw?.extension,
    raw?.agent_extension,
    raw?.agentExtension,
    raw?.agent?.extension,
    raw?.user?.extension,
    raw?.called?.[0]?.extension,
    raw?.userExtension,
    raw?.extensionNumber
  ));
  return {
    externalCallId,
    orgId: owner?.orgId || null,
    phoneNumberId: owner?.id || null,
    fromNumber,
    toNumber,
    businessNumber,
    direction,
    extension,
    startedAt: firstIso(raw?.started_at, raw?.startedAt, raw?.dateTimeUtc, raw?.created, raw?.timestamp),
    connectedAt: firstIso(raw?.connected_at, raw?.connectedAt, raw?.answered_at, raw?.answeredAt),
    endedAt: firstIso(raw?.ended_at, raw?.endedAt, raw?.endTime, raw?.finishedAt, raw?.completedAt),
    durationSeconds: firstNumber(raw?.duration_seconds, raw?.durationSeconds, raw?.duration, raw?.callDuration),
    waitSeconds: firstNumber(raw?.wait_seconds, raw?.waitSeconds, raw?.queueWaitSeconds),
    status: normalizeCallStatus(firstString(raw?.status, raw?.callStatus, raw?.state, raw?.requestState, raw?.callState, raw?.result)),
    recordingUrl: findRecordingUrl(raw),
    raw,
  };
}

export async function syncBusinessNumbers(): Promise<number> {
  const response = await mightyCallGetFirst<any>(BUSINESS_NUMBER_PATHS, {}, { optional: true });
  const rows = arrayFromApiResponse(response.data, ['data.phoneNumbers', 'phoneNumbers', 'numbers']);
  let count = 0;
  for (const raw of rows) {
    const number = normalizePhone(firstString(raw?.number, raw?.phoneNumber, raw?.e164, raw?.phone));
    if (!number) continue;
    const externalId = firstString(raw?.id, raw?.numberId, raw?.phoneNumberId, number) || number;
    const digits = normalizePhoneDigits(number);
    try {
      const existing = await findExistingPhoneNumber(number, digits);
      if (existing?.id) {
        await updateExistingPhoneNumber(existing.id, externalId, number, digits, raw);
        count += 1;
      }
    } catch (err) {
      console.warn('[mightycall api sync] business number skipped:', safeWarning(err));
    }
  }
  return count;
}

export async function syncUsersAndStatuses(): Promise<{ users: number; statuses: number; liveRingingSupported: 'unknown' | 'yes' | 'no' }> {
  const membersByExt = await loadOrgMembersByExtension();
  const usersResponse = await mightyCallGetFirst<any>(USER_PATHS, {}, { optional: true });
  const users = arrayFromApiResponse(usersResponse.data, ['data.users', 'users', 'items']);
  let syncedUsers = 0;
  let syncedStatuses = 0;
  let liveRingingSupported: 'unknown' | 'yes' | 'no' = 'unknown';
  const now = new Date().toISOString();
  const members = Array.from(membersByExt.values());

  for (const member of members) {
    await ensureLiveStatusRosterRow(member, now);
  }

  for (const user of users) {
    const extension = normalizePhoneDigits(firstString(user?.extension, user?.extensionNumber, user?.ext));
    if (!extension) continue;
    for (const member of Array.from(membersByExt.values()).filter((row) => row.extension === extension)) {
      await upsertLiveStatus(member, user, null, now);
      syncedUsers += 1;
    }
  }

  for (const member of members) {
    try {
      const extensionStatus = await getMightyCallStatusByExtension({
        extension: member.extension,
        orgId: member.orgId,
      });
      await upsertLiveStatusFromExtensionResolver(member, extensionStatus, now);
      syncedStatuses += 1;
      if (['ringing', 'dialing', 'on_call'].includes(extensionStatus.normalizedStatus)) liveRingingSupported = 'yes';
      continue;
    } catch (err) {
      console.warn('[mightycall api sync] extension status resolver failed:', safeWarning(err));
    }

    const statusPaths = [
      ...USER_STATUS_PATHS,
      `/users/${encodeURIComponent(member.extension)}/status`,
      `/user/${encodeURIComponent(member.extension)}/status`,
      `/profiles/${encodeURIComponent(member.extension)}/status`,
    ];
    const statusResponse = await mightyCallGetFirst<any>(statusPaths, {
      extension: member.extension,
      userExtension: member.extension,
    }, { optional: true });
    let liveCallPayload: any = null;
    try {
      const token = await getMightyCallToken();
      liveCallPayload = await fetchMightyCallLiveCallByExtension(member.extension, token);
    } catch {}
    if (!statusResponse.data && !liveCallPayload) continue;
    const combinedStatusPayload = liveCallPayload
      ? {
          ...(statusResponse.data || {}),
          status: liveCallPayload.status || liveCallPayload.callStatus || statusResponse.data?.status,
          state: liveCallPayload.callStatus || statusResponse.data?.state,
          onCall: true,
          currentCall: liveCallPayload.currentCall || liveCallPayload,
          sourceEndpoint: liveCallPayload.sourceEndpoint,
          liveLookupDebug: liveCallPayload.debug,
        }
      : statusResponse.data;
    const statusText = firstString(
      pickDeep(combinedStatusPayload, ['status.name', 'status.label', 'status.value']),
      (combinedStatusPayload as any)?.status,
      (combinedStatusPayload as any)?.state,
      (combinedStatusPayload as any)?.availability,
      (combinedStatusPayload as any)?.presenceStatus
    );
    const normalized = normalizeMightyCallStatus(statusText);
    if (normalized === 'ringing' || normalized === 'dialing' || normalized === 'on_call') liveRingingSupported = 'yes';
    await upsertLiveStatus(member, null, combinedStatusPayload, now);
    syncedStatuses += 1;
  }

  if (members.length > 0 && syncedStatuses > 0 && liveRingingSupported === 'unknown') liveRingingSupported = 'no';
  return { users: syncedUsers, statuses: syncedStatuses, liveRingingSupported };
}

async function upsertLiveStatusFromExtensionResolver(member: any, status: MightyCallStatusByExtension, now: string) {
  const normalized = status.normalizedStatus === 'unknown' ? 'available' : status.normalizedStatus;
  const active = ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(normalized);
  const row = {
    org_id: member.orgId,
    org_member_id: member.orgMemberId,
    user_id: member.userId,
    mightycall_user_id: status.mightycallUserId || null,
    mightycall_extension: member.extension,
    extension: member.extension,
    agent_name: firstString(status.name, member.name, member.email),
    raw_status: status.rawStatus || normalized,
    normalized_status: normalized,
    status: normalized,
    current_call_id: active ? status.currentCallId || null : null,
    current_call_direction: active ? status.direction || null : null,
    direction: active ? status.direction || null : null,
    from_number: null,
    to_number: null,
    business_number: null,
    current_counterpart_number: active ? status.counterpartNumber || null : null,
    started_at: active ? status.statusStartedAt || null : null,
    status_started_at: active ? status.statusStartedAt || null : null,
    last_event_at: now,
    last_synced_at: status.lastSyncedAt || now,
    source: status.source || 'mightycall_user_status_by_extension',
    stale: false,
    raw_payload: {
      assignment: member,
      extensionStatus: status,
      mightycallEmail: status.email || null,
      resolverRaw: status.raw,
    },
    raw_event: null,
    updated_at: now,
  };
  await supabaseAdmin.from('agent_live_status').upsert(row, { onConflict: 'org_id,mightycall_extension' });
  try {
    await supabaseAdmin.from('live_agent_statuses').upsert({
      org_id: member.orgId,
      org_member_id: member.orgMemberId,
      mightycall_user_id: row.mightycall_user_id,
      agent_name: row.agent_name,
      extension: member.extension,
      status: row.normalized_status,
      raw_status: row.raw_status,
      direction: row.direction,
      current_call_id: row.current_call_id,
      from_number: row.from_number,
      to_number: row.to_number,
      business_number: row.business_number,
      started_at: row.started_at,
      connected_at: row.started_at,
      last_seen_at: row.last_synced_at,
      raw_payload: row.raw_payload,
      updated_at: now,
    }, { onConflict: 'org_id,extension' });
  } catch {}
}

async function ensureLiveStatusRosterRow(member: any, now: string) {
  const { data: existing } = await supabaseAdmin
    .from('agent_live_status')
    .select('normalized_status, current_call_id')
    .eq('org_id', member.orgId)
    .eq('mightycall_extension', member.extension)
    .maybeSingle();
  const active = ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(String((existing as any)?.normalized_status || '').toLowerCase());
  if (active && (existing as any)?.current_call_id) return;
  await supabaseAdmin.from('agent_live_status').upsert({
    org_id: member.orgId,
    org_member_id: member.orgMemberId,
    user_id: member.userId,
    mightycall_extension: member.extension,
    extension: member.extension,
    agent_name: member.name,
    raw_status: existing ? ((existing as any).normalized_status || 'available') : 'available',
    normalized_status: existing ? ((existing as any).normalized_status || 'available') : 'available',
    status: existing ? ((existing as any).normalized_status || 'available') : 'available',
    last_event_at: now,
    last_synced_at: now,
    source: 'assignment_roster',
    stale: false,
    raw_payload: { assignment: member },
    updated_at: now,
  }, { onConflict: 'org_id,mightycall_extension' });
}

async function upsertLiveStatus(member: any, userInfo: any, statusPayload: any, now: string) {
  const rawStatus = firstString(
    pickDeep(statusPayload, ['status.name', 'status.label', 'status.value']),
    statusPayload?.status,
    statusPayload?.state,
    statusPayload?.availability,
    userInfo?.status
  );
  const currentCall = statusPayload?.currentCall || statusPayload?.current_call || statusPayload?.call || null;
  const currentCallStatus = currentCall ? liveStatusFromCall(currentCall) : null;
  const rawNormalizedStatus = normalizeMightyCallStatus(rawStatus);
  const status = currentCallStatus && (rawNormalizedStatus === 'unknown' || rawNormalizedStatus === 'available')
    ? currentCallStatus
    : rawNormalizedStatus;
  const fromNumber = normalizePhone(firstString(currentCall?.from_number, currentCall?.from, currentCall?.caller?.number, currentCall?.client?.address));
  const toNumber = normalizePhone(firstString(currentCall?.to_number, currentCall?.to, currentCall?.destination?.number, currentCall?.called?.[0]?.phone));
  const businessNumber = normalizePhone(firstString(currentCall?.businessNumber?.number, currentCall?.businessNumber));
  const direction = String(firstString(currentCall?.direction, currentCall?.callDirection) || '').toLowerCase();
  const row = {
    org_id: member.orgId,
    org_member_id: member.orgMemberId,
    user_id: member.userId,
    mightycall_user_id: firstString(userInfo?.id, userInfo?.userId, statusPayload?.userId),
    mightycall_extension: member.extension,
    extension: member.extension,
    agent_name: firstString(userInfo?.displayName, userInfo?.fullName, userInfo?.name, member.name),
    raw_status: rawStatus,
    normalized_status: status === 'away' ? 'unknown' : status,
    status: status === 'unknown' ? 'available' : status,
    current_call_id: firstString(currentCall?.id, currentCall?.callId),
    current_call_direction: direction.includes('out') ? 'outbound' : direction.includes('in') ? 'inbound' : null,
    direction: direction.includes('out') ? 'outbound' : direction.includes('in') ? 'inbound' : null,
    from_number: fromNumber,
    to_number: toNumber,
    business_number: businessNumber,
    current_counterpart_number: direction.includes('out') ? toNumber : fromNumber,
    started_at: firstIso(currentCall?.startedAt, currentCall?.started_at, currentCall?.dateTimeUtc),
    status_started_at: firstIso(currentCall?.startedAt, currentCall?.started_at, currentCall?.dateTimeUtc),
    last_event_at: now,
    last_synced_at: now,
    source: 'mightycall_api_poll',
    stale: false,
    raw_payload: { userInfo, statusPayload },
    raw_event: null,
    updated_at: now,
  };
  await supabaseAdmin.from('agent_live_status').upsert(row, { onConflict: 'org_id,mightycall_extension' });
  try {
    await supabaseAdmin.from('live_agent_statuses').upsert({
      org_id: member.orgId,
      org_member_id: member.orgMemberId,
      mightycall_user_id: row.mightycall_user_id,
      agent_name: row.agent_name,
      extension: member.extension,
      status: row.normalized_status,
      raw_status: row.raw_status,
      direction: row.direction,
      current_call_id: row.current_call_id,
      from_number: fromNumber,
      to_number: toNumber,
      business_number: businessNumber,
      started_at: row.started_at,
      connected_at: firstIso(currentCall?.connectedAt, currentCall?.answeredAt),
      last_seen_at: now,
      raw_payload: row.raw_payload,
      updated_at: now,
    }, { onConflict: 'org_id,extension' });
  } catch {}
}

export async function syncRecentCalls(windowHours = 48): Promise<number> {
  const start = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();
  const response = await mightyCallGetFirst<any>(CALL_LIST_PATHS, {
    from: start,
    to: end,
    dateFrom: start,
    dateTo: end,
    startUtc: start,
    endUtc: end,
    type: 'Call',
    requestType: 'Call',
    showUsers: true,
    pageSize: 200,
    limit: 200,
  }, { optional: true });
  const rawCalls = arrayFromApiResponse(response.data, ['data.calls', 'calls', 'requests', 'data.requests', 'items']);
  const businessPhones = await loadBusinessNumbers();
  const businessNumbers = businessPhones.map((phone) => phone.number).filter((value): value is string => !!value);
  const membersByExt = await loadOrgMembersByExtension();
  let count = 0;
  const activeKeys = new Set<string>();
  for (const raw of rawCalls.slice(0, 500)) {
    const owner = await resolveOrgByBusinessNumber(raw?.businessNumber?.number, raw?.businessNumber, raw?.to, raw?.to_number, raw?.from, raw?.from_number);
    const call = normalizeCallRow(raw, owner, businessNumbers);
    if (!call.orgId || !call.externalCallId) continue;
    await upsertCall(call);
    const activeStatus = liveStatusFromCall({ ...raw, ...call });
    if (activeStatus) {
      await upsertLiveStatusFromCall(call, raw, activeStatus, membersByExt);
      if (call.extension) activeKeys.add(`${call.orgId}:${call.extension}`);
    } else {
      await clearCompletedLiveStatus(call);
    }
    if (call.recordingUrl) {
      await upsertRecording({
        org_id: call.orgId,
        external_call_id: call.externalCallId,
        external_id: call.externalCallId,
        from_number: call.fromNumber,
        to_number: call.toNumber,
        business_number: call.businessNumber,
        direction: call.direction,
        agent_extension: call.extension,
        started_at: call.startedAt,
        duration_seconds: call.durationSeconds,
      }, raw, call.recordingUrl);
    }
    count += 1;
  }
  await expireCallPollStatuses(activeKeys);
  return count;
}

async function upsertLiveStatusFromCall(
  call: ReturnType<typeof normalizeCallRow>,
  raw: any,
  normalizedStatus: 'ringing' | 'dialing' | 'on_call' | 'on_hold' | 'transferring',
  membersByExt: Map<string, any>
) {
  if (!call.orgId || !call.extension || !call.externalCallId) return;
  const member = membersForExtension(membersByExt, call.extension, call.orgId)[0] || {
    orgId: call.orgId,
    orgMemberId: null,
    userId: null,
    name: null,
    extension: call.extension,
  };
  const now = new Date().toISOString();
  const startedAt = call.startedAt || firstIso(raw?.created, raw?.dateTimeUtc) || now;
  const direction = call.direction === 'unknown' ? null : call.direction;
  const counterpart = direction === 'outbound' ? call.toNumber : call.fromNumber;
  const row = {
    org_id: call.orgId,
    org_member_id: member.orgMemberId,
    user_id: member.userId,
    mightycall_user_id: firstString(raw?.userId, raw?.user?.id, raw?.agent?.id),
    mightycall_extension: call.extension,
    extension: call.extension,
    agent_name: firstString(raw?.user?.displayName, raw?.user?.name, raw?.agent?.displayName, raw?.agent?.name, member.name),
    raw_status: callLifecycleStatus(raw) || normalizedStatus,
    normalized_status: normalizedStatus,
    status: normalizedStatus,
    current_call_id: call.externalCallId,
    external_call_id: call.externalCallId,
    current_call_direction: direction,
    direction,
    from_number: call.fromNumber,
    to_number: call.toNumber,
    business_number: call.businessNumber,
    current_counterpart_number: counterpart,
    started_at: startedAt,
    answered_at: call.connectedAt,
    status_started_at: startedAt,
    ended_at: null,
    last_event_at: now,
    last_synced_at: now,
    source: 'mightycall_api_call_poll',
    stale: false,
    raw_payload: raw,
    raw_event: raw,
    updated_at: now,
  };
  await supabaseAdmin.from('agent_live_status').upsert(row, { onConflict: 'org_id,mightycall_extension' });
  try {
    await supabaseAdmin.from('live_agent_statuses').upsert({
      org_id: call.orgId,
      org_member_id: member.orgMemberId,
      mightycall_user_id: row.mightycall_user_id,
      agent_name: row.agent_name,
      extension: call.extension,
      status: normalizedStatus,
      raw_status: row.raw_status,
      direction,
      current_call_id: call.externalCallId,
      from_number: call.fromNumber,
      to_number: call.toNumber,
      business_number: call.businessNumber,
      started_at: startedAt,
      connected_at: call.connectedAt,
      last_seen_at: now,
      raw_payload: raw,
      updated_at: now,
    }, { onConflict: 'org_id,extension' });
  } catch {}
}

async function clearCompletedLiveStatus(call: ReturnType<typeof normalizeCallRow>) {
  if (!call.orgId || !call.externalCallId) return;
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('agent_live_status')
    .update({
      normalized_status: 'available',
      status: 'available',
      raw_status: 'available',
      current_call_id: null,
      external_call_id: null,
      current_call_direction: null,
      direction: null,
      current_counterpart_number: null,
      ended_at: call.endedAt || now,
      last_event_at: now,
      last_synced_at: now,
      source: 'mightycall_api_call_poll',
      stale: false,
      updated_at: now,
    })
    .eq('org_id', call.orgId)
    .eq('current_call_id', call.externalCallId);
}

async function expireCallPollStatuses(activeKeys: Set<string>) {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from('agent_live_status')
    .select('org_id, mightycall_extension, normalized_status, current_call_id')
    .eq('source', 'mightycall_api_call_poll')
    .in('normalized_status', ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'])
    .limit(1000);
  for (const row of data || []) {
    const key = `${(row as any).org_id}:${(row as any).mightycall_extension}`;
    if (activeKeys.has(key)) continue;
    await supabaseAdmin
      .from('agent_live_status')
      .update({
        normalized_status: 'available',
        status: 'available',
        raw_status: 'available',
        current_call_id: null,
        external_call_id: null,
        current_call_direction: null,
        direction: null,
        current_counterpart_number: null,
        ended_at: now,
        last_event_at: now,
        last_synced_at: now,
        stale: false,
        updated_at: now,
      })
      .eq('org_id', (row as any).org_id)
      .eq('mightycall_extension', (row as any).mightycall_extension);
  }
}

async function upsertCall(call: ReturnType<typeof normalizeCallRow>) {
  const row = {
    org_id: call.orgId,
    external_id: call.externalCallId,
    external_call_id: call.externalCallId,
    phone_number_id: call.phoneNumberId,
    direction: call.direction,
    from_number: call.fromNumber,
    to_number: call.toNumber,
    business_number: call.businessNumber,
    started_at: call.startedAt,
    connected_at: call.connectedAt,
    answered_at: call.connectedAt,
    ended_at: call.endedAt,
    duration_seconds: call.durationSeconds,
    wait_seconds: call.waitSeconds,
    status: call.status,
    agent_extension: call.extension,
    extension: call.extension,
    has_recording: !!call.recordingUrl,
    recording_url: call.recordingUrl,
    metadata: call.raw,
    raw_payload: call.raw,
  };
  try {
    await supabaseAdmin.from('calls').upsert(row, { onConflict: 'org_id,external_id' });
  } catch {
    await supabaseAdmin.from('calls').upsert({
      org_id: row.org_id,
      external_id: row.external_id,
      direction: row.direction,
      from_number: row.from_number,
      to_number: row.to_number,
      started_at: row.started_at,
      answered_at: row.answered_at,
      ended_at: row.ended_at,
      duration_seconds: row.duration_seconds,
      status: row.status,
      agent_extension: row.agent_extension,
      metadata: row.metadata,
    }, { onConflict: 'org_id,external_id' });
  }
}

export async function syncCallDetails(maxCalls = 50): Promise<{ details: number; recordings: number; transfers: number; transferDetailsSupported: boolean }> {
  const { data } = await supabaseAdmin
    .from('calls')
    .select('id, org_id, external_id, external_call_id, from_number, to_number, business_number, direction, agent_extension, started_at')
    .not('external_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(maxCalls);
  let details = 0;
  let recordings = 0;
  let transfers = 0;
  let transferDetailsSupported = false;
  const membersByExt = await loadOrgMembersByExtension();
  for (const row of data || []) {
    const externalCallId = String((row as any).external_call_id || (row as any).external_id || '');
    if (!externalCallId) continue;
    const paths = CALL_DETAIL_PATHS.map((path) => path.replace('{id}', encodeURIComponent(externalCallId)));
    const response = await mightyCallGetFirst<any>(paths, {}, { optional: true });
    if (!response.data) continue;
    const detailRaw = unwrapApiObject(response.data);
    details += 1;
    const recordingUrl = findRecordingUrl(detailRaw);
    const transfer = detectTransferFromCallDetail(detailRaw);
    const owner = await resolveOrgByBusinessNumber((row as any).business_number, (row as any).to_number, (row as any).from_number);
    const call = normalizeCallRow({ ...(row as any), ...detailRaw, id: externalCallId }, owner || {
      orgId: (row as any).org_id,
      id: '',
      number: (row as any).business_number || null,
      digits: normalizePhoneDigits((row as any).business_number) || '',
    }, [(row as any).business_number].filter(Boolean));
    await upsertCall({ ...call, orgId: (row as any).org_id, externalCallId });
    const activeStatus = liveStatusFromCall({ ...detailRaw, ...call });
    if (activeStatus) {
      await upsertLiveStatusFromCall({ ...call, orgId: (row as any).org_id, externalCallId }, detailRaw, activeStatus, membersByExt);
    } else {
      await clearCompletedLiveStatus({ ...call, orgId: (row as any).org_id, externalCallId });
    }
    if (recordingUrl) {
      await upsertRecording((row as any), detailRaw, recordingUrl);
      recordings += 1;
    }
    if (transfer) {
      transferDetailsSupported = true;
      await upsertTransfer((row as any), detailRaw, transfer);
      transfers += 1;
    }
  }
  return { details, recordings, transfers, transferDetailsSupported };
}

async function upsertRecording(callRow: any, raw: any, recordingUrl: string) {
  const externalCallId = String(callRow.external_call_id || callRow.external_id || '');
  const externalRecordingId = firstString(raw?.recordingId, raw?.recording_id, raw?.recording?.id, externalCallId, recordingUrl);
  await supabaseAdmin.from('mightycall_recordings').upsert({
    org_id: callRow.org_id,
    external_id: externalRecordingId,
    external_recording_id: externalRecordingId,
    external_call_id: externalCallId,
    call_id: externalCallId,
    phone_number: callRow.business_number || callRow.to_number || callRow.from_number,
    recording_url: recordingUrl,
    duration_seconds: firstNumber(raw?.duration_seconds, raw?.durationSeconds, raw?.duration, callRow.duration_seconds),
    recording_date: firstIso(raw?.recordedAt, raw?.recordingDate, raw?.started_at, callRow.started_at) || new Date().toISOString(),
    recorded_at: firstIso(raw?.recordedAt, raw?.recordingDate, raw?.started_at, callRow.started_at) || new Date().toISOString(),
    from_number: normalizePhone(firstString(raw?.from_number, raw?.from, callRow.from_number)),
    to_number: normalizePhone(firstString(raw?.to_number, raw?.to, callRow.to_number)),
    direction: callRow.direction || 'unknown',
    extension: callRow.agent_extension || null,
    raw_payload: raw,
    metadata: raw,
  }, { onConflict: 'org_id,external_id' });
}

async function upsertTransfer(callRow: any, raw: any, transfer: NonNullable<ReturnType<typeof detectTransferFromCallDetail>>) {
  const externalCallId = String(callRow.external_call_id || callRow.external_id || '');
  const id = [externalCallId, transfer.transferTarget || 'target', transfer.transferType || 'unknown'].join(':');
  await supabaseAdmin.from('call_transfers').upsert({
    org_id: callRow.org_id,
    external_transfer_id: id,
    external_call_id: externalCallId,
    extension: callRow.agent_extension || null,
    agent_extension: callRow.agent_extension || null,
    from_number: callRow.from_number,
    to_number: callRow.to_number,
    original_caller: callRow.from_number,
    original_receiving_number: callRow.to_number,
    business_number: callRow.business_number || callRow.to_number,
    transfer_target: transfer.transferTarget,
    transfer_type: transfer.transferType,
    transfer_status: transfer.transferStatus,
    result: transfer.transferStatus,
    transferred_at: firstIso(raw?.transferredAt, raw?.transfer?.createdAt, callRow.started_at) || new Date().toISOString(),
    raw_payload: raw,
  }, { onConflict: 'org_id,external_transfer_id' });
}

export async function syncRecordingsFromCallDetails(): Promise<number> {
  return (await syncCallDetails(50)).recordings;
}

export async function syncTransfersFromCallDetailsIfAvailable(): Promise<number> {
  return (await syncCallDetails(50)).transfers;
}

export async function syncVoicemails(): Promise<number> {
  const response = await mightyCallGetFirst<any>(VOICEMAIL_PATHS, { pageSize: 100, limit: 100 }, { optional: true });
  const rows = arrayFromApiResponse(response.data, ['data.voicemails', 'voicemails', 'items']);
  return rows.length;
}

export async function syncSmsIfApiSupported(): Promise<{ synced: number; supported: boolean; reason?: string }> {
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();
  const response = await mightyCallGetFirst<any>(SMS_PATHS, {
    type: 'Message',
    requestType: 'Message',
    origin: 'All',
    state: 'All',
    showUsers: true,
    resolveContacts: false,
    from: start,
    to: end,
    dateFrom: start,
    dateTo: end,
    pageSize: 200,
    limit: 200,
  }, { optional: true });
  if (!response.data) {
    return {
      synced: 0,
      supported: false,
      reason: 'MightyCall API documentation did not expose SMS/message history endpoint',
    };
  }
  const rows = arrayFromApiResponse(response.data, ['data.messages', 'messages', 'data.requests', 'requests', 'items']);
  const businessPhones = await loadBusinessNumbers();
  const businessNumbers = businessPhones.map((phone) => phone.number).filter((value): value is string => !!value);
  let synced = 0;
  for (const raw of rows) {
    const apiDirection = directionFromText(firstString(raw?.direction, raw?.messageDirection, raw?.messageInfo?.origin, raw?.origin, raw?.type));
    const businessNumber = normalizePhone(firstString(raw?.businessNumber?.number, raw?.businessNumber, raw?.messageInfo?.businessNumber));
    const clientNumber = normalizePhone(firstString(raw?.client?.address, raw?.client?.number, raw?.messageInfo?.client?.address));
    const rawFrom = normalizePhone(firstString(raw?.from_number, raw?.from, raw?.sender?.number, raw?.sender, raw?.client?.address));
    const rawTo = normalizePhone(firstString(raw?.to_number, raw?.to, raw?.recipient?.number, raw?.recipient, raw?.destination?.number));
    const from = apiDirection === 'outbound'
      ? (businessNumber || rawFrom)
      : (rawFrom || clientNumber);
    const to = apiDirection === 'outbound'
      ? (rawTo || clientNumber)
      : (businessNumber || rawTo);
    const owner = await resolveOrgByBusinessNumber(businessNumber, from, to);
    if (!owner) continue;
    const inferredDirection = detectDirectionFromNumbers(from, to, businessNumbers);
    const direction = apiDirection !== 'unknown' ? apiDirection : inferredDirection;
    const externalId = firstString(raw?.messageId, raw?.message_id, raw?.id, raw?.requestGuid)
      || [from, to, firstIso(raw?.created, raw?.sentAt) || new Date().toISOString()].join(':');
    await supabaseAdmin.from('mightycall_sms_messages').upsert({
      org_id: owner.orgId,
      phone_id: owner.id,
      external_id: externalId,
      external_message_id: externalId,
      from_number: from,
      to_number: to,
      business_number: owner.number,
      message_text: firstString(raw?.body, raw?.message_text, raw?.text, raw?.textModel?.text, raw?.messageInfo?.text),
      body: firstString(raw?.body, raw?.message_text, raw?.text, raw?.textModel?.text, raw?.messageInfo?.text),
      direction,
      status: firstString(raw?.status, raw?.messageDeliveryStatus, raw?.messageInfo?.deliveryStatus),
      sent_at: firstIso(raw?.sent_at, raw?.sentAt, raw?.created) || new Date().toISOString(),
      message_date: firstIso(raw?.sent_at, raw?.sentAt, raw?.created) || new Date().toISOString(),
      raw_payload: raw,
      metadata: raw,
    }, { onConflict: 'org_id,external_id' });
    synced += 1;
  }
  return { synced, supported: true };
}

export async function runLiveStatusSync(reason = 'manual-status') {
  if (statusSyncRunning) return { ok: true, skipped: true, reason: 'Status sync already running' };
  statusSyncRunning = true;
  const result = emptyResult(reason);
  const startedAt = new Date().toISOString();
  try {
    const statuses = await syncUsersAndStatuses();
    result.syncedUsers = statuses.users;
    result.syncedStatuses = statuses.statuses;
    result.capabilities.liveRingingSupported = statuses.liveRingingSupported;
    return result;
  } catch (err) {
    result.ok = false;
    result.warnings.push(safeWarning(err));
    return result;
  } finally {
    statusSyncRunning = false;
    await recordSyncRun(result, result.ok ? 'completed' : 'failed', startedAt, new Date().toISOString());
  }
}

export async function runMightyCallSync(reason = 'manual'): Promise<SyncResult> {
  if (syncRunning) return { ...emptyResult(reason), skipped: true, reason: 'Sync already running' };
  syncRunning = true;
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const result = emptyResult(reason);
  try {
    result.syncedUsers += await syncBusinessNumbers();
    const statuses = await syncUsersAndStatuses();
    result.syncedUsers += statuses.users;
    result.syncedStatuses += statuses.statuses;
    result.capabilities.liveRingingSupported = statuses.liveRingingSupported;
    if (Date.now() - startedAtMs < 20_000) result.syncedCalls += await syncRecentCalls();
    if (Date.now() - startedAtMs < 25_000) {
      const details = await syncCallDetails();
      result.syncedCallDetails += details.details;
      result.syncedRecordings += details.recordings;
      result.syncedTransfers += details.transfers;
      result.capabilities.transferDetailsSupported = details.transferDetailsSupported;
    }
    if (Date.now() - startedAtMs < 28_000) {
      const sms = await syncSmsIfApiSupported();
      result.syncedSms += sms.synced;
      result.capabilities.smsSupported = sms.supported;
      result.capabilities.smsReason = sms.reason;
    }
    return result;
  } catch (err) {
    result.ok = false;
    result.warnings.push(safeWarning(err));
    return result;
  } finally {
    syncRunning = false;
    await recordSyncRun(result, result.ok ? 'completed' : 'failed', startedAt, new Date().toISOString());
  }
}

async function runPhoneInventoryBackgroundSync() {
  return withBackgroundLock('phoneInventory', async () => {
    await syncMightyCallPhoneNumbers(supabaseAdmin);
    trackLastSync('phoneInventory');
  });
}

async function runRollingReportsBackgroundSync() {
  return withBackgroundLock('reports', async () => {
    const orgIds = await getBackgroundSyncOrgIds();
    const start = isoDateDaysAgo(BACKGROUND_SYNC_LOOKBACK_DAYS);
    const end = new Date().toISOString().slice(0, 10);
    for (const orgId of orgIds) {
      try {
        const phoneIds = await getPhoneIdsForOrg(orgId);
        await syncMightyCallReports(supabaseAdmin, orgId, phoneIds, start, end);
        await syncMightyCallCallHistory(supabaseAdmin, orgId, { dateStart: start, dateEnd: end });
      } catch (err) {
        console.warn('[mightycall background] reports/calls sync failed:', orgId, safeWarning(err));
      }
    }
    trackLastSync('reports');
  });
}

async function runRollingSmsBackgroundSync() {
  return withBackgroundLock('sms', async () => {
    const orgIds = await getBackgroundSyncOrgIds();
    for (const orgId of orgIds) {
      try {
        await syncMightyCallSMS(supabaseAdmin, orgId);
      } catch (err) {
        console.warn('[mightycall background] sms sync failed:', orgId, safeWarning(err));
      }
    }
    try {
      await syncSmsIfApiSupported();
    } catch (err) {
      console.warn('[mightycall background] api sms sync failed:', safeWarning(err));
    }
    trackLastSync('sms');
  });
}

async function runRollingRecordingsBackgroundSync() {
  return withBackgroundLock('recordings', async () => {
    const orgIds = await getBackgroundSyncOrgIds();
    const start = isoDateDaysAgo(BACKGROUND_SYNC_LOOKBACK_DAYS);
    const end = new Date().toISOString().slice(0, 10);
    for (const orgId of orgIds) {
      try {
        const phoneIds = await getPhoneIdsForOrg(orgId);
        await syncMightyCallRecordings(supabaseAdmin, orgId, phoneIds, start, end);
      } catch (err) {
        console.warn('[mightycall background] recordings sync failed:', orgId, safeWarning(err));
      }
    }
    try {
      await syncCallDetails(100);
    } catch (err) {
      console.warn('[mightycall background] call details recording sync failed:', safeWarning(err));
    }
    trackLastSync('recordings');
  });
}

async function runRollingVoicemailBackgroundSync() {
  return withBackgroundLock('voicemails', async () => {
    const orgIds = await getBackgroundSyncOrgIds();
    for (const orgId of orgIds) {
      try {
        await syncMightyCallVoicemails(supabaseAdmin, orgId);
      } catch (err) {
        console.warn('[mightycall background] voicemail sync failed:', orgId, safeWarning(err));
      }
    }
    trackLastSync('voicemails');
  });
}

export function startMightyCallPolling() {
  if (schedulerStarted || process.env.MIGHTYCALL_DISABLE_POLLING === 'true') return;
  schedulerStarted = true;
  const tick = async () => {
    const now = Date.now();
    if (now - lastStatusSyncAt > POLL_STATUS_INTERVAL_MS) {
      lastStatusSyncAt = now;
      runLiveStatusSync('poll-status').catch((err) => console.warn('[mightycall poll] status sync failed:', safeWarning(err)));
    }
    if (now - lastRecentCallsSyncAt > POLL_RECENT_CALLS_INTERVAL_MS) {
      lastRecentCallsSyncAt = now;
      syncRecentCalls().catch((err) => console.warn('[mightycall poll] recent calls failed:', safeWarning(err)));
    }
    if (now - lastSlowSyncAt > POLL_CALL_DETAILS_INTERVAL_MS) {
      lastSlowSyncAt = now;
      syncCallDetails(25).catch((err) => console.warn('[mightycall poll] call details failed:', safeWarning(err)));
    }
    if (now - lastPhoneInventorySyncAt > POLL_PHONE_INVENTORY_INTERVAL_MS) {
      lastPhoneInventorySyncAt = now;
      runPhoneInventoryBackgroundSync().catch((err) => console.warn('[mightycall poll] phone inventory failed:', safeWarning(err)));
    }
    if (now - lastReportsSyncAt > POLL_REPORTS_INTERVAL_MS) {
      lastReportsSyncAt = now;
      runRollingReportsBackgroundSync().catch((err) => console.warn('[mightycall poll] reports failed:', safeWarning(err)));
    }
    if (now - lastSmsSyncAt > POLL_SMS_INTERVAL_MS) {
      lastSmsSyncAt = now;
      runRollingSmsBackgroundSync().catch((err) => console.warn('[mightycall poll] sms failed:', safeWarning(err)));
    }
    if (now - lastRecordingsSyncAt > POLL_RECORDINGS_INTERVAL_MS) {
      lastRecordingsSyncAt = now;
      runRollingRecordingsBackgroundSync().catch((err) => console.warn('[mightycall poll] recordings failed:', safeWarning(err)));
    }
    if (now - lastVoicemailSyncAt > POLL_VOICEMAIL_INTERVAL_MS) {
      lastVoicemailSyncAt = now;
      runRollingVoicemailBackgroundSync().catch((err) => console.warn('[mightycall poll] voicemails failed:', safeWarning(err)));
    }
  };
  setInterval(tick, 5_000).unref?.();
  tick().catch(() => undefined);
}
