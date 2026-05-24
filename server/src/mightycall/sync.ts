import { supabaseAdmin } from '../lib/supabaseClient';
import { mightyCallGetFirst } from './client';
import {
  arrayFromApiResponse,
  detectDirectionFromNumbers,
  detectTransferFromCallDetail,
  findRecordingUrl,
  firstIso,
  firstNumber,
  firstString,
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

const CALL_LIST_PATHS = ['/calls', '/call-history', '/callhistory', '/journal/calls'];
const CALL_DETAIL_PATHS = ['/calls/{id}', '/call-history/{id}', '/callhistory/{id}', '/journal/calls/{id}'];
const BUSINESS_NUMBER_PATHS = ['/phonenumbers', '/phone_numbers', '/business-numbers', '/businessNumbers'];
const USER_PATHS = ['/users', '/profiles', '/members'];
const USER_STATUS_PATHS = ['/profile/status', '/users/status', '/user/status', '/status'];
const VOICEMAIL_PATHS = ['/voicemails', '/voice-mails', '/voicemail'];
const SMS_PATHS = ['/messages', '/sms', '/text-messages', '/journal/messages', '/journal/requests'];

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
  const { data } = await supabaseAdmin
    .from('phone_numbers')
    .select('id, org_id, number, number_digits, e164, phone_number');
  return (data || []).map((row: any) => ({
    id: String(row.id || ''),
    orgId: String(row.org_id || ''),
    number: normalizePhone(row.number || row.e164 || row.phone_number),
    digits: normalizePhoneDigits(row.number_digits || row.number || row.e164 || row.phone_number),
  })).filter((row) => row.orgId && row.digits);
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

async function loadOrgMembersByExtension() {
  const [orgMembers, orgUsers] = await Promise.all([
    Promise.resolve(supabaseAdmin.from('org_members').select('id, org_id, user_id, full_name, role, mightycall_extension').not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
    Promise.resolve(supabaseAdmin.from('org_users').select('id, org_id, user_id, role, mightycall_extension').not('mightycall_extension', 'is', null)).then((r) => r.data || []).catch(() => []),
  ]);
  const byExtension = new Map<string, any>();
  for (const row of [...orgUsers, ...orgMembers] as any[]) {
    const extension = normalizePhoneDigits(row?.mightycall_extension);
    if (!extension) continue;
    const key = `${row.org_id}:${extension}`;
    byExtension.set(key, {
      orgMemberId: row.id || null,
      orgId: row.org_id,
      userId: row.user_id || null,
      name: row.full_name || null,
      role: row.role || 'agent',
      extension,
    });
  }
  return byExtension;
}

function normalizeCallRow(raw: any, owner: Awaited<ReturnType<typeof resolveOrgByBusinessNumber>>, businessNumbers: string[]) {
  const externalCallId = firstString(raw?.external_call_id, raw?.externalCallId, raw?.callId, raw?.id, raw?.requestGuid, raw?.guid);
  const fromNumber = normalizePhone(firstString(raw?.from_number, raw?.from, raw?.caller?.number, raw?.client?.address, raw?.source?.number));
  const toNumber = normalizePhone(firstString(raw?.to_number, raw?.to, raw?.called?.[0]?.phone, raw?.businessNumber?.number, raw?.destination?.number));
  const businessNumber = normalizePhone(firstString(raw?.business_number, raw?.businessNumber?.number, raw?.businessNumber, owner?.number, toNumber, fromNumber));
  const explicitDirection = String(firstString(raw?.direction, raw?.callDirection, raw?.Direction) || '').toLowerCase();
  const direction = explicitDirection.includes('out')
    ? 'outbound'
    : explicitDirection.includes('in')
      ? 'inbound'
      : detectDirectionFromNumbers(fromNumber, toNumber, businessNumbers);
  const extension = normalizePhoneDigits(firstString(raw?.extension, raw?.agent_extension, raw?.agent?.extension, raw?.user?.extension, raw?.called?.[0]?.extension));
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
    endedAt: firstIso(raw?.ended_at, raw?.endedAt, raw?.endTime, raw?.finishedAt),
    durationSeconds: firstNumber(raw?.duration_seconds, raw?.durationSeconds, raw?.duration, raw?.callDuration),
    waitSeconds: firstNumber(raw?.wait_seconds, raw?.waitSeconds, raw?.queueWaitSeconds),
    status: normalizeCallStatus(firstString(raw?.status, raw?.callStatus, raw?.state)),
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
      const { data: existing } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, org_id')
        .or(`number.eq.${number},number_digits.eq.${digits}`)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.from('phone_numbers').update({
          external_id: externalId,
          number,
          number_digits: digits,
          label: firstString(raw?.label, raw?.name),
          metadata: raw,
          is_active: raw?.isActive !== false,
        }).eq('id', existing.id);
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

  for (const user of users) {
    const extension = normalizePhoneDigits(firstString(user?.extension, user?.extensionNumber, user?.ext));
    if (!extension) continue;
    for (const member of Array.from(membersByExt.values()).filter((row) => row.extension === extension)) {
      await upsertLiveStatus(member, user, null, now);
      syncedUsers += 1;
    }
  }

  const members = Array.from(membersByExt.values());
  for (const member of members) {
    const statusResponse = await mightyCallGetFirst<any>(USER_STATUS_PATHS, {
      extension: member.extension,
      userExtension: member.extension,
    }, { optional: true });
    if (!statusResponse.data) continue;
    const statusText = firstString(
      pickDeep(statusResponse.data, ['status.name', 'status.label', 'status.value']),
      (statusResponse.data as any)?.status,
      (statusResponse.data as any)?.state,
      (statusResponse.data as any)?.availability,
      (statusResponse.data as any)?.presenceStatus
    );
    const normalized = normalizeMightyCallStatus(statusText);
    if (normalized === 'ringing' || normalized === 'dialing' || normalized === 'on_call') liveRingingSupported = 'yes';
    await upsertLiveStatus(member, null, statusResponse.data, now);
    syncedStatuses += 1;
  }

  if (members.length > 0 && syncedStatuses > 0 && liveRingingSupported === 'unknown') liveRingingSupported = 'no';
  return { users: syncedUsers, statuses: syncedStatuses, liveRingingSupported };
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
  const status = normalizeMightyCallStatus(rawStatus);
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
    startUtc: start,
    endUtc: end,
    pageSize: 200,
    limit: 200,
  }, { optional: true });
  const rawCalls = arrayFromApiResponse(response.data, ['data.calls', 'calls', 'items']);
  const businessPhones = await loadBusinessNumbers();
  const businessNumbers = businessPhones.map((phone) => phone.number).filter((value): value is string => !!value);
  let count = 0;
  for (const raw of rawCalls.slice(0, 500)) {
    const owner = await resolveOrgByBusinessNumber(raw?.businessNumber?.number, raw?.businessNumber, raw?.to, raw?.to_number, raw?.from, raw?.from_number);
    const call = normalizeCallRow(raw, owner, businessNumbers);
    if (!call.orgId || !call.externalCallId) continue;
    await upsertCall(call);
    count += 1;
  }
  return count;
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
  for (const row of data || []) {
    const externalCallId = String((row as any).external_call_id || (row as any).external_id || '');
    if (!externalCallId) continue;
    const paths = CALL_DETAIL_PATHS.map((path) => path.replace('{id}', encodeURIComponent(externalCallId)));
    const response = await mightyCallGetFirst<any>(paths, {}, { optional: true });
    if (!response.data) continue;
    details += 1;
    const recordingUrl = findRecordingUrl(response.data);
    const transfer = detectTransferFromCallDetail(response.data);
    const owner = await resolveOrgByBusinessNumber((row as any).business_number, (row as any).to_number, (row as any).from_number);
    const call = normalizeCallRow({ ...(row as any), ...response.data, id: externalCallId }, owner || {
      orgId: (row as any).org_id,
      id: '',
      number: (row as any).business_number || null,
      digits: normalizePhoneDigits((row as any).business_number) || '',
    }, [(row as any).business_number].filter(Boolean));
    await upsertCall({ ...call, orgId: (row as any).org_id, externalCallId });
    if (recordingUrl) {
      await upsertRecording((row as any), response.data, recordingUrl);
      recordings += 1;
    }
    if (transfer) {
      transferDetailsSupported = true;
      await upsertTransfer((row as any), response.data, transfer);
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
  const response = await mightyCallGetFirst<any>(SMS_PATHS, { type: 'Message', requestType: 'Message', pageSize: 100, limit: 100 }, { optional: true });
  if (!response.data) {
    return {
      synced: 0,
      supported: false,
      reason: 'MightyCall API documentation did not expose SMS/message history endpoint',
    };
  }
  const rows = arrayFromApiResponse(response.data, ['data.messages', 'messages', 'requests', 'items']);
  const businessPhones = await loadBusinessNumbers();
  const businessNumbers = businessPhones.map((phone) => phone.number).filter((value): value is string => !!value);
  let synced = 0;
  for (const raw of rows) {
    const from = normalizePhone(firstString(raw?.from_number, raw?.from, raw?.sender?.number, raw?.client?.address));
    const to = normalizePhone(firstString(raw?.to_number, raw?.to, raw?.recipient?.number, raw?.destination?.number));
    const owner = await resolveOrgByBusinessNumber(from, to, raw?.businessNumber?.number, raw?.businessNumber);
    if (!owner) continue;
    const direction = detectDirectionFromNumbers(from, to, businessNumbers);
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

export function startMightyCallPolling() {
  if (schedulerStarted || process.env.MIGHTYCALL_DISABLE_POLLING === 'true') return;
  schedulerStarted = true;
  const tick = async () => {
    const now = Date.now();
    if (now - lastStatusSyncAt > 5_000) {
      lastStatusSyncAt = now;
      runLiveStatusSync('poll-status').catch((err) => console.warn('[mightycall poll] status sync failed:', safeWarning(err)));
    }
    if (now - lastRecentCallsSyncAt > 15_000) {
      lastRecentCallsSyncAt = now;
      syncRecentCalls().catch((err) => console.warn('[mightycall poll] recent calls failed:', safeWarning(err)));
    }
    if (now - lastSlowSyncAt > 60_000) {
      lastSlowSyncAt = now;
      syncCallDetails(25).catch((err) => console.warn('[mightycall poll] call details failed:', safeWarning(err)));
    }
  };
  setInterval(tick, 5_000).unref?.();
  tick().catch(() => undefined);
}
