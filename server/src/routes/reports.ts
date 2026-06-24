import express from 'express';
import { supabaseAdmin } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';
import { isOrgAdmin, isOrgManagerWith, isPlatformAdmin } from '../auth/rbac';

type ReportScope = {
  actorId: string;
  isPlatformAdmin: boolean;
  orgIds: string[];
  orgWide: boolean;
  allowedPhoneIds: Set<string>;
  allowedPhoneDigits: Set<string>;
  allowedExtensions: Set<string>;
  requestedPhoneDigits: Set<string>;
};

const router = express.Router();
const FIVE_YEAR_LOOKBACK_MS = 5 * 366 * 24 * 60 * 60 * 1000;

function resolveReportDateRange(req: express.Request, endOfDayColumn = true) {
  const end = asDateParam(req.query.end_date || req.query.to, endOfDayColumn) || new Date().toISOString();
  const endMs = Date.parse(end);
  const earliest = new Date((Number.isFinite(endMs) ? endMs : Date.now()) - FIVE_YEAR_LOOKBACK_MS).toISOString();
  const requestedStart = asDateParam(req.query.start_date || req.query.from);
  const start = !requestedStart || Date.parse(requestedStart) < Date.parse(earliest) ? earliest : requestedStart;
  return { start, end };
}

function csvParam(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
}

function objectValue(value: unknown): any {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function rowMetadata(row: any): any {
  return objectValue(row?.metadata || row?.payload || row?.data);
}

function rowRawPayload(row: any): any {
  return objectValue(row?.raw_payload || row?.payload || row?.data || row?.metadata);
}

function asDateParam(value: unknown, endOfDay = false): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const withTime = text.includes('T') ? text : `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
  const parsed = Date.parse(withTime);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function durationToSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.max(0, Math.round(value));
    return rounded > 12 * 60 * 60 ? Math.round(rounded / 1000) : rounded;
  }
  if (value && typeof value === 'object') {
    const item: any = value;
    const seconds = firstValue(
      item.seconds,
      item.totalSeconds,
      item.durationSeconds,
      item.duration_seconds,
      item.value,
      item.duration
    );
    const parsedSeconds = durationToSeconds(seconds);
    if (parsedSeconds > 0) return parsedSeconds;
    const millis = Number(firstValue(item.milliseconds, item.ms, item.totalMilliseconds));
    if (Number.isFinite(millis) && millis > 0) return Math.max(0, Math.round(millis / 1000));
  }
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const rounded = Math.max(0, Math.round(Number(text)));
    return rounded > 12 * 60 * 60 ? Math.round(rounded / 1000) : rounded;
  }
  const parts = text.split(':').map((part) => Number(part));
  if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
    return Math.max(0, Math.round(parts.reduce((total, part) => total * 60 + part, 0)));
  }
  const units = text.toLowerCase().match(/(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?/);
  if (units && (units[1] || units[2] || units[3])) {
    return Math.max(0, Math.round((Number(units[1] || 0) * 3600) + (Number(units[2] || 0) * 60) + Number(units[3] || 0)));
  }
  return 0;
}

function secondsBetween(start: unknown, end: unknown): number {
  const startMs = Date.parse(String(start || ''));
  const endMs = Date.parse(String(end || ''));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 1000);
}

function rowTimestamp(row: any): string | null {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  return firstString(
    row.started_at,
    row.date_time_utc,
    row.dateTimeUtc,
    row.recording_date,
    row.sent_at,
    row.message_date,
    row.transferred_at,
    row.created_at,
    metadata?.started_at,
    metadata?.dateTimeUtc,
    metadata?.created,
    raw?.started_at,
    raw?.dateTimeUtc,
    raw?.created
  );
}

function rowNumbers(row: any): string[] {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  const values = [
    row?.phone_number,
    row?.business_number,
    row?.from_number,
    row?.to_number,
    row?.from,
    row?.to,
    row?.original_caller,
    row?.original_receiving_number,
    row?.transfer_target,
    metadata?.phone_number,
    metadata?.business_number,
    metadata?.businessNumber?.number,
    metadata?.businessNumber,
    metadata?.from_number,
    metadata?.to_number,
    metadata?.client?.address,
    metadata?.client?.number,
    metadata?.called?.[0]?.phone,
    metadata?.called?.[0]?.number,
    raw?.phone_number,
    raw?.business_number,
    raw?.businessNumber?.number,
    raw?.businessNumber,
    raw?.from_number,
    raw?.to_number,
    raw?.from,
    raw?.to,
    raw?.client?.address,
    raw?.client?.number,
    raw?.called?.[0]?.phone,
    raw?.called?.[0]?.number,
  ];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function rowMatchesDigits(row: any, digits: Set<string>): boolean {
  if (digits.size === 0) return true;
  const rowDigits = rowNumbers(row).map((value) => normalizePhoneDigits(value)).filter((value): value is string => !!value);
  return rowDigits.some((value) => digits.has(value));
}

function statusOf(row: any): string {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  return String(row?.status || row?.result || row?.call_status || metadata?.status || metadata?.result || raw?.status || raw?.result || '').toLowerCase();
}

function directionOf(row: any): string {
  const metadata = rowMetadata(row);
  const rawPayload = rowRawPayload(row);
  const raw = String(
    row?.direction ||
    row?.current_call_direction ||
    row?.call_direction ||
    row?.callDirection ||
    row?.origin ||
    row?.requestOrigin ||
    metadata?.direction ||
    metadata?.callDirection ||
    metadata?.call_direction ||
    metadata?.origin ||
    metadata?.requestOrigin ||
    metadata?.callInfo?.direction ||
    metadata?.callInfo?.origin ||
    metadata?.communication?.direction ||
    metadata?.communication?.origin ||
    rawPayload?.direction ||
    rawPayload?.callDirection ||
    rawPayload?.call_direction ||
    rawPayload?.origin ||
    rawPayload?.requestOrigin ||
    rawPayload?.callInfo?.direction ||
    rawPayload?.callInfo?.origin ||
    rawPayload?.communication?.direction ||
    rawPayload?.communication?.origin ||
    ''
  ).toLowerCase();
  if (raw.includes('out')) return 'outbound';
  if (raw.includes('in')) return 'inbound';
  if (raw === 'external' || raw === 'sent' || raw === 'api') return 'outbound';
  if (raw === 'internal' || raw === 'received') return 'inbound';
  return raw;
}

function rowAgentExtension(row: any): string {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  return String(
    row?.agent_extension ||
    row?.mightycall_extension ||
    row?.extension ||
    metadata?.agent_extension ||
    metadata?.mightycall_extension ||
    metadata?.agent?.extension ||
    metadata?.users?.[0]?.extension ||
    raw?.agent_extension ||
    raw?.agent?.extension ||
    raw?.users?.[0]?.extension ||
    ''
  ).replace(/\D/g, '');
}

function inferDirectionFromOwnedNumbers(row: any, ownedDigits: Set<string>): 'inbound' | 'outbound' | 'unknown' {
  const explicit = directionOf(row);
  const origin = String(
    row?.origin ||
    row?.requestOrigin ||
    row?.callDirection ||
    row?.call_direction ||
    row?.message_origin ||
    row?.metadata?.direction ||
    row?.metadata?.callDirection ||
    row?.metadata?.call_direction ||
    row?.metadata?.origin ||
    row?.metadata?.requestOrigin ||
    row?.metadata?.callInfo?.direction ||
    row?.metadata?.callInfo?.origin ||
    row?.metadata?.messageInfo?.origin ||
    row?.raw_payload?.direction ||
    row?.raw_payload?.callDirection ||
    row?.raw_payload?.call_direction ||
    row?.raw_payload?.origin ||
    row?.raw_payload?.requestOrigin ||
    row?.raw_payload?.callInfo?.direction ||
    row?.raw_payload?.callInfo?.origin ||
    ''
  ).toLowerCase();
  if (origin.includes('out')) return 'outbound';
  if (origin.includes('in')) return 'inbound';
  if (explicit === 'outbound' || explicit === 'inbound') return explicit;
  const fromDigits = normalizePhoneDigits(row?.from_number || row?.metadata?.from_number || row?.metadata?.from);
  const toDigits = normalizePhoneDigits(row?.to_number || row?.metadata?.to_number || row?.metadata?.to);
  const businessDigits = normalizePhoneDigits(row?.business_number || row?.phone_number || row?.metadata?.business_number || row?.metadata?.businessNumber?.number || row?.metadata?.businessNumber);
  const hasOwnedFrom = !!fromDigits && ownedDigits.has(fromDigits);
  const hasOwnedTo = !!toDigits && ownedDigits.has(toDigits);
  const hasBusinessFrom = !!businessDigits && !!fromDigits && businessDigits === fromDigits;
  const hasBusinessTo = !!businessDigits && !!toDigits && businessDigits === toDigits;
  if (hasOwnedFrom || hasBusinessFrom) return 'outbound';
  if (hasOwnedTo || hasBusinessTo) return 'inbound';
  return 'unknown';
}

function normalizeDirection(row: any, ownedDigits: Set<string>): 'inbound' | 'outbound' | 'unknown' {
  const inferred = inferDirectionFromOwnedNumbers(row, ownedDigits);
  if (inferred !== 'unknown') return inferred;
  const explicit = directionOf(row);
  if (explicit === 'inbound' || explicit === 'outbound') return explicit;
  const raw = String(explicit || '').toLowerCase();
  if (raw.includes('incoming') || raw.includes('received')) return 'inbound';
  if (raw.includes('outgoing') || raw.includes('sent')) return 'outbound';
  return 'unknown';
}

function recordingUrlOf(row: any): string | null {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  const url = firstString(
    row?.recording_url,
    row?.recordingUrl,
    row?.recording_link,
    row?.recordingLink,
    row?.download_url,
    row?.downloadUrl,
    row?.audio_url,
    metadata?.recording_url,
    metadata?.recordingUrl,
    metadata?.recording_link,
    metadata?.recordingLink,
    metadata?.download_url,
    metadata?.downloadUrl,
    metadata?.audio_url,
    metadata?.recording?.url,
    metadata?.callRecord?.uri,
    metadata?.callRecord?.url,
    metadata?.callRecord?.fileName,
    metadata?.recording?.link,
    metadata?.recording?.downloadUrl,
    metadata?.recordings?.[0]?.url,
    metadata?.recordings?.[0]?.link,
    raw?.recording_url,
    raw?.recordingUrl,
    raw?.recording_link,
    raw?.recordingLink,
    raw?.download_url,
    raw?.downloadUrl,
    raw?.audio_url,
    raw?.recording?.url,
    raw?.callRecord?.uri,
    raw?.callRecord?.url,
    raw?.callRecord?.fileName,
    raw?.recording?.link,
    raw?.recording?.downloadUrl,
    raw?.recordings?.[0]?.url,
    raw?.recordings?.[0]?.link
  );
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function recordingIdOf(row: any): string | null {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  return firstString(
    row?.recording_id,
    row?.recordingId,
    row?.external_recording_id,
    row?.mightycall_recording_id,
    metadata?.recording_id,
    metadata?.recordingId,
    metadata?.external_recording_id,
    metadata?.recording?.id,
    metadata?.callRecord?.id,
    metadata?.callRecord?.fileName,
    metadata?.callRecord?.uri,
    metadata?.recordings?.[0]?.id,
    raw?.recording_id,
    raw?.recordingId,
    raw?.external_recording_id,
    raw?.recording?.id,
    raw?.callRecord?.id,
    raw?.callRecord?.fileName,
    raw?.callRecord?.uri,
    raw?.recordings?.[0]?.id
  );
}

function callDurationSeconds(row: any): number {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  const direct = durationToSeconds(firstValue(
    row?.duration_seconds,
    row?.durationSeconds,
    row?.duration,
    row?.call_duration,
    row?.callDuration,
    row?.duration_in_seconds,
    row?.durationInSeconds,
    row?.talk_time,
    row?.talkTime,
    row?.billable_seconds,
    metadata?.duration_seconds,
    metadata?.durationSeconds,
    metadata?.duration,
    metadata?.call_duration,
    metadata?.callDuration,
    metadata?.duration_in_seconds,
    metadata?.durationInSeconds,
    metadata?.talk_time,
    metadata?.talkTime,
    metadata?.conversationDuration,
    metadata?.callInfo?.duration,
    metadata?.callInfo?.durationSeconds,
    metadata?.callInfo?.duration_seconds,
    metadata?.recording?.duration,
    raw?.duration_seconds,
    raw?.durationSeconds,
    raw?.duration,
    raw?.call_duration,
    raw?.callDuration,
    raw?.duration_in_seconds,
    raw?.durationInSeconds,
    raw?.talk_time,
    raw?.talkTime,
    raw?.conversationDuration,
    raw?.callInfo?.duration,
    raw?.callInfo?.durationSeconds,
    raw?.recording?.duration
  ));
  if (direct > 0) return direct;
  return secondsBetween(
    firstValue(row?.answered_at, row?.connected_at, row?.started_at, metadata?.answered_at, metadata?.connected_at, metadata?.started_at, metadata?.callInfo?.startedAt, raw?.answered_at, raw?.connected_at, raw?.started_at, raw?.callInfo?.startedAt),
    firstValue(row?.ended_at, row?.completed_at, metadata?.ended_at, metadata?.completed_at, metadata?.callInfo?.endedAt, raw?.ended_at, raw?.completed_at, raw?.callInfo?.endedAt)
  );
}

function recordingDurationSeconds(row: any): number {
  const metadata = rowMetadata(row);
  const raw = rowRawPayload(row);
  const direct = durationToSeconds(firstValue(
    row?.duration_seconds,
    row?.durationSeconds,
    row?.duration,
    row?.recording_duration,
    row?.recordingDuration,
    metadata?.duration_seconds,
    metadata?.durationSeconds,
    metadata?.duration,
    metadata?.recording_duration,
    metadata?.recordingDuration,
    metadata?.recording?.duration,
    metadata?.recording?.durationSeconds,
    metadata?.callInfo?.duration,
    raw?.duration_seconds,
    raw?.durationSeconds,
    raw?.duration,
    raw?.recording_duration,
    raw?.recordingDuration,
    raw?.recording?.duration,
    raw?.recording?.durationSeconds,
    raw?.callInfo?.duration
  ));
  return direct || callDurationSeconds(row);
}

async function getUserOrgIds(actorId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('org_users')
    .select('org_id')
    .eq('user_id', actorId);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => String(row.org_id)).filter(Boolean)));
}

async function getOrgPhones(orgIds: string[]) {
  if (orgIds.length === 0) return [];
  return queryPhoneNumbers(orgIds);
}

async function queryPhoneNumbers(orgIds?: string[]) {
  const byId = new Map<string, { id: string; org_id: string; number: string; label: string | null; digits: string }>();
  try {
    let orgPhoneQuery = supabaseAdmin
      .from('org_phone_numbers')
      .select('id, org_id, phone_number_id, phone_number, label');
    if (orgIds && orgIds.length > 0) orgPhoneQuery = orgPhoneQuery.in('org_id', orgIds);
    const { data: orgPhones, error: orgPhoneError } = await orgPhoneQuery;
    if (!orgPhoneError && Array.isArray(orgPhones) && orgPhones.length > 0) {
      const phoneIds = Array.from(new Set(orgPhones.map((row: any) => String(row.phone_number_id || '')).filter(Boolean)));
      const phoneById = new Map<string, any>();
      if (phoneIds.length > 0) {
        for (const select of ['id, number, label, e164, phone_number, number_digits', 'id, number, label', 'id, phone_number, label']) {
          const { data, error } = await supabaseAdmin.from('phone_numbers').select(select).in('id', phoneIds);
          if (!error) {
            for (const phone of data || []) phoneById.set(String((phone as any).id), phone);
            break;
          }
        }
      }
      for (const row of orgPhones as any[]) {
        const phone = row.phone_number_id ? phoneById.get(String(row.phone_number_id)) : null;
        const number = String(row.phone_number || phone?.number || phone?.e164 || phone?.phone_number || '').trim();
        const id = String(row.phone_number_id || row.id || '').trim();
        const digits = normalizePhoneDigits(phone?.number_digits || number) || '';
        if (!id || !row.org_id || !digits) continue;
        byId.set(`${row.org_id}:${id}`, {
          id,
          org_id: String(row.org_id),
          number,
          label: row.label || phone?.label || null,
          digits,
        });
      }
    }
  } catch {}
  const selects = [
    'id, org_id, number, label, number_digits, e164, phone_number',
    'id, org_id, number, label, phone_number',
    'id, org_id, number, label',
    'id, org_id, phone_number, label',
  ];
  let lastError: any = null;
  for (const select of selects) {
    let query = supabaseAdmin.from('phone_numbers').select(select);
    if (orgIds && orgIds.length > 0) query = query.in('org_id', orgIds);
    const { data, error } = await query;
    if (!error) {
      for (const phone of normalizePhoneRows(data || [])) byId.set(`${phone.org_id}:${phone.id}`, phone);
      return Array.from(byId.values());
    }
    lastError = error;
    if (!/number_digits|e164|phone_number|number|schema cache|does not exist/i.test(error.message || '')) throw error;
  }
  if (byId.size > 0) return Array.from(byId.values());
  throw lastError;
}

function normalizePhoneRows(rows: any[]) {
  return rows.map((row: any) => ({
    id: String(row.id || ''),
    org_id: String(row.org_id || ''),
    number: String(row.number || row.e164 || row.phone_number || ''),
    label: row.label || null,
    digits: normalizePhoneDigits(row.number_digits || row.number || row.e164 || row.phone_number) || '',
  })).filter((row) => row.org_id && row.digits);
}

async function getUserAssignedPhoneIds(actorId: string, orgIds: string[]) {
  const out = new Set<string>();
  if (orgIds.length === 0) return out;
  try {
    const { data } = await supabaseAdmin
      .from('user_phone_assignments')
      .select('phone_number_id')
      .eq('user_id', actorId)
      .in('org_id', orgIds);
    for (const row of data || []) {
      if ((row as any).phone_number_id) out.add(String((row as any).phone_number_id));
    }
  } catch {}
  try {
    const { data } = await supabaseAdmin
      .from('org_members')
      .select('assigned_phone_number_ids')
      .eq('user_id', actorId)
      .in('org_id', orgIds);
    for (const row of data || []) {
      const ids = Array.isArray((row as any).assigned_phone_number_ids) ? (row as any).assigned_phone_number_ids : [];
      for (const id of ids) out.add(String(id));
    }
  } catch {}
  return out;
}

async function getUserAssignedExtensions(actorId: string, orgIds: string[]) {
  const out = new Set<string>();
  if (orgIds.length === 0) return out;
  const addRows = (rows: any[] | null | undefined) => {
    for (const row of rows || []) {
      const extension = String(row?.mightycall_extension || row?.extension || '').replace(/\D/g, '');
      if (extension) out.add(extension);
    }
  };
  try {
    const { data } = await supabaseAdmin
      .from('org_users')
      .select('mightycall_extension')
      .eq('user_id', actorId)
      .in('org_id', orgIds);
    addRows(data as any[]);
  } catch {}
  try {
    const { data } = await supabaseAdmin
      .from('org_members')
      .select('mightycall_extension')
      .eq('user_id', actorId)
      .in('org_id', orgIds);
    addRows(data as any[]);
  } catch {}
  return out;
}

async function loadAgentIdentityMap(scope: Pick<ReportScope, 'orgIds' | 'isPlatformAdmin'>) {
  const queryRows = async (table: string) => {
    try {
      let query = supabaseAdmin
        .from(table)
        .select('id, org_id, user_id, role, mightycall_extension');
      if (scope.orgIds.length > 0) query = query.in('org_id', scope.orgIds);
      return ((await query.not('mightycall_extension', 'is', null)).data || []) as any[];
    } catch {
      return [];
    }
  };
  const [orgUsers, orgMembers] = await Promise.all([queryRows('org_users'), queryRows('org_members')]);
  const rows = [...orgUsers, ...orgMembers].filter((row) => rowAgentExtension(row));
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
  const byOrgExtension = new Map<string, any>();
  const byExtension = new Map<string, any>();
  for (const row of rows) {
    const extension = rowAgentExtension(row);
    const profile = row.user_id ? profileById.get(String(row.user_id)) : null;
    const email = profile?.email || (row.user_id ? authEmailById.get(String(row.user_id)) : null) || null;
    const name = profile?.full_name || (email ? String(email).split('@')[0] : null) || `Extension ${extension}`;
    const identity = {
      org_id: row.org_id || null,
      user_id: row.user_id || null,
      extension,
      agent_name: name,
      email,
      role: row.role || 'agent',
    };
    byOrgExtension.set(`${row.org_id}:${extension}`, identity);
    if (!byExtension.has(extension)) byExtension.set(extension, identity);
  }
  return { byOrgExtension, byExtension };
}

function resolveAgentIdentity(row: any, identities: Awaited<ReturnType<typeof loadAgentIdentityMap>>) {
  const extension = rowAgentExtension(row);
  if (!extension) return null;
  return identities.byOrgExtension.get(`${row.org_id || ''}:${extension}`) || identities.byExtension.get(extension) || {
    extension,
    agent_name: `Extension ${extension}`,
    email: null,
    org_id: row.org_id || null,
  };
}

async function resolveScope(req: express.Request): Promise<ReportScope> {
  const actorId = req.header('x-user-id') || '';
  if (!actorId) {
    const error = new Error('unauthenticated') as Error & { status?: number };
    error.status = 401;
    throw error;
  }

  const admin = await isPlatformAdmin(actorId);
  const requestedOrgId = String(req.query.org_id || '').trim();
  const userOrgIds = admin ? [] : await getUserOrgIds(actorId);
  const orgIds = admin
    ? (requestedOrgId ? [requestedOrgId] : [])
    : (requestedOrgId ? [requestedOrgId] : userOrgIds.slice(0, 1));

  if (!admin && requestedOrgId && !userOrgIds.includes(requestedOrgId)) {
    const error = new Error('forbidden') as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  if (!admin && orgIds.length === 0) {
    return {
      actorId,
      isPlatformAdmin: false,
      orgIds: [],
      orgWide: false,
      allowedPhoneIds: new Set(),
      allowedPhoneDigits: new Set(),
      allowedExtensions: new Set(),
      requestedPhoneDigits: new Set(),
    };
  }

  let orgWide = admin;
  if (!admin) {
    for (const orgId of orgIds) {
      if ((await isOrgAdmin(actorId, orgId)) || (await isOrgManagerWith(actorId, orgId, 'can_manage_agents'))) {
        orgWide = true;
        break;
      }
    }
  }

  const phones = await getOrgPhones(orgIds);
  const assignedPhoneIds = orgWide ? new Set(phones.map((phone) => phone.id)) : await getUserAssignedPhoneIds(actorId, orgIds);
  const allowedExtensions = orgWide || admin ? new Set<string>() : await getUserAssignedExtensions(actorId, orgIds);
  const allowedPhones = orgWide ? phones : phones.filter((phone) => assignedPhoneIds.has(phone.id));
  const allowedPhoneDigits = new Set(allowedPhones.map((phone) => phone.digits).filter((value): value is string => !!value));
  const requestedPhoneDigits = new Set(csvParam(req.query.phone_number || req.query.number || req.query.numbers).map((value) => normalizePhoneDigits(value)).filter((value): value is string => !!value));

  if (!admin && requestedPhoneDigits.size > 0) {
    for (const digits of requestedPhoneDigits) {
      if (!allowedPhoneDigits.has(digits)) {
        const error = new Error('forbidden_number_filter') as Error & { status?: number };
        error.status = 403;
        throw error;
      }
    }
  }

  return {
    actorId,
    isPlatformAdmin: admin,
    orgIds,
    orgWide,
    allowedPhoneIds: new Set(allowedPhones.map((phone) => phone.id).filter((value): value is string => !!value)),
    allowedPhoneDigits,
    allowedExtensions,
    requestedPhoneDigits,
  };
}

function applyCommonFilters(rows: any[], req: express.Request, scope: ReportScope, options: { skipDirection?: boolean; skipStatus?: boolean; skipAgent?: boolean; skipSearch?: boolean } = {}) {
  const direction = String(req.query.direction || '').toLowerCase();
  const status = String(req.query.status || '').toLowerCase();
  const agent = String(req.query.agent || req.query.extension || '').replace(/\D/g, '');
  const search = String(req.query.search || '').trim().toLowerCase();
  const numberDigits = scope.requestedPhoneDigits.size > 0 ? scope.requestedPhoneDigits : scope.allowedPhoneDigits;

  return rows.filter((row) => {
    if (!scope.isPlatformAdmin) {
      const matchesRequestedPhone = scope.requestedPhoneDigits.size === 0 || rowMatchesDigits(row, scope.requestedPhoneDigits);
      if (!matchesRequestedPhone) return false;
      if (!scope.orgWide && scope.requestedPhoneDigits.size === 0) {
        const matchesAllowedPhone = scope.allowedPhoneDigits.size > 0 && rowMatchesDigits(row, scope.allowedPhoneDigits);
        const matchesAssignedAgent = scope.allowedExtensions.size > 0 && scope.allowedExtensions.has(rowAgentExtension(row));
        if (!matchesAllowedPhone && !matchesAssignedAgent) return false;
      }
    }
    if (scope.isPlatformAdmin && scope.requestedPhoneDigits.size > 0 && !rowMatchesDigits(row, scope.requestedPhoneDigits)) return false;
    if (!options.skipDirection && direction && direction !== 'all' && directionOf(row) !== direction) return false;
    if (!options.skipStatus && status && status !== 'all' && statusOf(row) !== status) return false;
    if (!options.skipAgent && agent) {
      if (rowAgentExtension(row) !== agent) return false;
    }
    if (!options.skipSearch && search) {
      const haystack = [
        ...rowNumbers(row),
        row?.message_text,
        row?.status,
        row?.result,
        row?.agent_extension,
        row?.transfer_target,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

async function fetchTableRows(table: string, dateColumn: string, req: express.Request, scope: ReportScope, max = 10000, options: { skipDirection?: boolean; skipStatus?: boolean; skipAgent?: boolean; skipSearch?: boolean } = {}) {
  if (!scope.isPlatformAdmin && scope.orgIds.length === 0) return [];
  const { start, end } = resolveReportDateRange(req);
  let query = supabaseAdmin.from(table).select('*');
  if (scope.orgIds.length > 0) query = query.in('org_id', scope.orgIds);
  if (start) query = query.gte(dateColumn, start);
  if (end) query = query.lte(dateColumn, end);
  query = query.order(dateColumn, { ascending: false }).limit(max);
  const { data, error } = await query;
  if (error) {
    if (
      ['PGRST204', 'PGRST205', '42703'].includes(String(error.code || '')) ||
      /not exist|schema cache|column .* does not exist|could not find .* column/i.test(error.message || '')
    ) return [];
    throw error;
  }
  return applyCommonFilters(data || [], req, scope, options);
}

async function fetchFirstAvailableRows(
  table: string,
  dateColumns: string[],
  req: express.Request,
  scope: ReportScope,
  max = 10000,
  options: { skipDirection?: boolean; skipStatus?: boolean; skipAgent?: boolean; skipSearch?: boolean } = {}
) {
  for (const dateColumn of dateColumns) {
    const rows = await fetchTableRows(table, dateColumn, req, scope, max, options);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function fetchRealCallRows(
  req: express.Request,
  scope: ReportScope,
  max = 10000,
  options: { skipDirection?: boolean; skipStatus?: boolean; skipAgent?: boolean; skipSearch?: boolean } = {}
) {
  const dateColumns = ['started_at', 'date_time_utc', 'dateTimeUtc', 'call_date', 'timestamp', 'created_at'];
  const mightyCallLogRows = await fetchFirstAvailableRows('mightycall_call_logs', dateColumns, req, scope, max, options);
  if (mightyCallLogRows.length > 0) {
    return mightyCallLogRows.map((row) => ({
      ...row,
      metadata: row.metadata || row.raw_payload || row.payload || row.data || row,
      raw_payload: row.raw_payload || row.payload || row.data || row.metadata || row,
    }));
  }
  return fetchFirstAvailableRows('calls', ['started_at', 'created_at'], req, scope, max, options);
}

function paginate(req: express.Request, rows: any[]) {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 500), 5000));
  const offset = Math.max(0, Number(req.query.offset || 0));
  return {
    rows: rows.slice(offset, offset + limit),
    next_offset: offset + limit < rows.length ? offset + limit : null,
    total: rows.length,
  };
}

function avg(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value) && value > 0);
  return nums.length === 0 ? 0 : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function groupCount(rows: any[], keyFn: (row: any) => string | null, limit = 10) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function groupBusinessNumberCounts(
  rows: any[],
  phones: Array<{ number: string; digits: string; label?: string | null }>,
  limit = 10
) {
  const phoneByDigits = new Map(phones.filter((phone) => phone.digits).map((phone) => [phone.digits, phone]));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const candidates = [
      row?.business_number,
      row?.phone_number,
      row?.original_receiving_number,
      row?.metadata?.business_number,
      row?.metadata?.businessNumber?.number,
      row?.raw_payload?.businessNumber?.number,
      row?.raw_payload?.businessNumber,
      row?.direction === 'outbound' ? row?.from_number : null,
      row?.direction === 'inbound' ? row?.to_number : null,
      row?.from_number,
      row?.to_number,
    ];
    let matched: string | null = null;
    for (const value of candidates) {
      const digits = normalizePhoneDigits(value);
      if (digits && phoneByDigits.has(digits)) {
        matched = digits;
        break;
      }
    }
    if (!matched) continue;
    counts.set(matched, (counts.get(matched) || 0) + 1);
  }
  return Array.from(phoneByDigits.values())
    .map((phone) => ({
      key: phone.number || phone.digits,
      label: phone.label || phone.number || phone.digits,
      number: phone.number,
      count: counts.get(phone.digits) || 0,
      unit: 'calls',
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function groupAgentStats(calls: any[], transfers: any[], identities: Awaited<ReturnType<typeof loadAgentIdentityMap>>, limit?: number) {
  const byAgent = new Map<string, any>();
  const ensure = (row: any) => {
    const extension = rowAgentExtension(row);
    if (!extension) return null;
    const identity = resolveAgentIdentity(row, identities);
    const key = `${identity?.org_id || row.org_id || ''}:${extension}`;
    const current = byAgent.get(key) || {
      key,
      extension,
      org_id: identity?.org_id || row.org_id || null,
      agent_name: identity?.agent_name || `Extension ${extension}`,
      label: identity?.agent_name || `Extension ${extension}`,
      email: identity?.email || null,
      total_calls: 0,
      total_recordings: 0,
      total_sms: 0,
      total_activity: 0,
      answered_calls: 0,
      missed_calls: 0,
      total_duration_seconds: 0,
      transfers: 0,
      count: 0,
      unit: 'activities',
    };
    byAgent.set(key, current);
    return current;
  };
  for (const call of calls) {
    const current = ensure(call);
    if (!current) continue;
    const isSms = !!(call.message_text || call.body || call.message);
    const isRecording = !!call.recording_url;
    if (isSms) current.total_sms += 1;
    else if (isRecording) current.total_recordings += 1;
    else current.total_calls += 1;
    current.total_activity += 1;
    current.count = current.total_activity;
    if (statusOf(call).includes('answer') || statusOf(call).includes('complete')) current.answered_calls += 1;
    if (statusOf(call).includes('miss')) current.missed_calls += 1;
    current.total_duration_seconds += safeNumber(call.duration_seconds);
  }
  for (const transfer of transfers) {
    const current = ensure(transfer);
    if (!current) continue;
    current.transfers += 1;
  }
  const rows = Array.from(byAgent.values()).map((row) => ({
    ...row,
    avg_duration_seconds: row.total_calls > 0 ? Math.round(row.total_duration_seconds / row.total_calls) : 0,
  })).sort((a, b) => b.total_activity - a.total_activity || b.total_calls - a.total_calls || b.transfers - a.transfers);
  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}

function normalizeSmsDirections(rows: any[], ownedDigits: Set<string>) {
  return rows.map((row) => ({
    ...row,
    direction: inferDirectionFromOwnedNumbers(row, ownedDigits),
  }));
}

function normalizeRecordingRows(rows: any[], ownedDigits: Set<string>) {
  const seen = new Set<string>();
  const normalized = rows.map((row) => {
    const metadata = rowMetadata(row);
    const raw = rowRawPayload(row);
    const businessNumber = firstString(
      row.business_number,
      row.phone_number,
      metadata?.business_number,
      metadata?.businessNumber?.number,
      metadata?.businessNumber,
      metadata?.phone_number,
      raw?.business_number,
      raw?.businessNumber?.number,
      raw?.businessNumber,
      raw?.phone_number
    );
    const clientNumber = firstString(
      metadata?.client?.address,
      metadata?.client?.number,
      raw?.client?.address,
      raw?.client?.number,
      metadata?.caller_number,
      raw?.caller_number,
      row.from_number,
      metadata?.from_number,
      raw?.from_number
    );
    const origin = String(firstString(metadata?.origin, raw?.origin, row.direction, metadata?.callDirection, raw?.callDirection) || '').toLowerCase();
    const fromNumber = origin.includes('out')
      ? (businessNumber || row.from_number || metadata?.from_number || null)
      : firstString(row.from_number, metadata?.from_number, raw?.from_number, metadata?.client?.address, raw?.client?.address);
    const toNumber = origin.includes('out')
      ? (clientNumber || row.to_number || metadata?.to_number || null)
      : firstString(row.to_number, metadata?.to_number, raw?.to_number, metadata?.businessNumber?.number, raw?.businessNumber?.number);
    const recordingUrl = recordingUrlOf(row);
    const direction = normalizeDirection({ ...row, from_number: fromNumber, to_number: toNumber, business_number: businessNumber, metadata, raw_payload: raw }, ownedDigits);
    return {
      ...row,
      recording_id: recordingIdOf(row),
      recording_url: recordingUrl,
      from_number: fromNumber,
      to_number: toNumber,
      business_number: businessNumber,
      direction,
      duration_seconds: recordingDurationSeconds({ ...row, metadata, raw_payload: raw }),
    };
  }).filter((row) => {
    if (!row.recording_url) return false;
    const keys = [
      row.external_recording_id,
      row.recording_id,
      row.external_id,
      row.external_call_id,
      row.call_id,
      row.recording_url,
      row.id,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    if (keys.length === 0) return false;
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
  return normalized;
}

function normalizeCallRows(rows: any[], ownedDigits: Set<string>) {
  return rows.map((row) => {
    const metadata = rowMetadata(row);
    const raw = rowRawPayload(row);
    const fromNumber = firstString(
      row.from_number,
      row.from,
      row.caller_number,
      row.caller,
      metadata?.from_number,
      metadata?.from,
      metadata?.caller_number,
      metadata?.caller?.number,
      metadata?.client?.address,
      metadata?.client?.number,
      raw?.from_number,
      raw?.from,
      raw?.caller_number,
      raw?.caller?.phone,
      raw?.caller?.number,
      raw?.caller,
      raw?.client?.address,
      raw?.client?.number
    );
    const toNumber = firstString(
      row.to_number,
      row.to,
      row.called_number,
      row.destination_number,
      metadata?.to_number,
      metadata?.to,
      metadata?.called_number,
      metadata?.destination_number,
      metadata?.called?.[0]?.phone,
      metadata?.called?.[0]?.number,
      raw?.to_number,
      raw?.to,
      raw?.called_number,
      raw?.destination_number,
      raw?.called?.[0]?.phone,
      raw?.called?.[0]?.number,
      raw?.called?.phone,
      raw?.called?.number,
      Array.isArray(raw?.called) ? raw?.called?.[0] : raw?.called
    );
    const businessNumber = firstString(
      row.business_number,
      row.phone_number,
      metadata?.business_number,
      metadata?.businessNumber?.number,
      metadata?.businessNumber,
      raw?.business_number,
      raw?.businessNumber?.number,
      raw?.businessNumber
    );
    const startedAt = firstString(
      row.started_at,
      row.date_time_utc,
      row.dateTimeUtc,
      row.start_time,
      row.created,
      row.timestamp,
      row.created_at,
      metadata?.started_at,
      metadata?.dateTimeUtc,
      metadata?.start_time,
      metadata?.created,
      raw?.started_at,
      raw?.dateTimeUtc,
      raw?.start_time,
      raw?.created
    );
    const endedAt = firstString(row.ended_at, row.endedAt, row.end_time, metadata?.ended_at, metadata?.endedAt, raw?.ended_at, raw?.endedAt);
    const agentExtension = firstString(row.agent_extension, row.extension, row.mightycall_extension, metadata?.agent_extension, metadata?.extension, metadata?.agent?.extension, raw?.agent_extension, raw?.extension, raw?.agent?.extension);
    const direction = normalizeDirection({
      ...row,
      from_number: fromNumber,
      to_number: toNumber,
      business_number: businessNumber,
      metadata,
      raw_payload: raw,
    }, ownedDigits);
    const normalizedRow = {
      ...row,
      from_number: fromNumber,
      to_number: toNumber || businessNumber,
      business_number: businessNumber,
      started_at: startedAt,
      ended_at: endedAt,
      agent_extension: agentExtension,
      metadata,
      raw_payload: raw,
    };
    const durationSeconds = callDurationSeconds(normalizedRow);
    const recordingUrl = recordingUrlOf(normalizedRow);
    const recordingId = recordingIdOf(normalizedRow);
    return {
      ...normalizedRow,
      direction,
      status: normalizeReportCallStatus(normalizedRow),
      duration_seconds: durationSeconds,
      external_id: row.external_id || row.call_id || row.callId || raw?.id || raw?.callId || null,
      external_call_id: row.external_call_id || row.call_id || row.callId || raw?.id || raw?.callId || null,
      recording_id: row.recording_id || row.mightycall_recording_id || recordingId || null,
      recording_url: row.recording_url || recordingUrl || null,
      has_recording: Boolean(row.has_recording || row.recording_url || recordingUrl || recordingId),
    };
  });
}

function callRecordingMatchKeys(row: any) {
  return [
    row?.id,
    row?.external_id,
    row?.external_call_id,
    row?.call_id,
    row?.recording_url,
    row?.metadata?.call_id,
    row?.metadata?.external_id,
    row?.metadata?.external_call_id,
    row?.metadata?.recording_url,
    row?.raw_payload?.call_id,
    row?.raw_payload?.external_id,
    row?.raw_payload?.external_call_id,
    row?.raw_payload?.recording_url,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

async function enrichCallsWithRecordingLinks(rows: any[], req: express.Request, scope: ReportScope, ownedDigits: Set<string>) {
  if (rows.length === 0) return rows;
  const recordings = normalizeRecordingRows(
    await fetchTableRows('mightycall_recordings', 'recording_date', req, scope, 10000, { skipDirection: true, skipStatus: true, skipAgent: true, skipSearch: true }),
    ownedDigits
  );
  if (recordings.length === 0) {
    return rows.map((row) => ({
      ...row,
      has_recording: Boolean(row.recording_url || row.has_recording),
      recording_id: row.recording_id || row.mightycall_recording_id || null,
    }));
  }

  const byKey = new Map<string, any>();
  for (const recording of recordings) {
    for (const key of callRecordingMatchKeys(recording)) {
      if (!byKey.has(key)) byKey.set(key, recording);
    }
  }

  return rows.map((row) => {
    const existingUrl = recordingUrlOf(row);
    let recording = null;
    for (const key of callRecordingMatchKeys(row)) {
      recording = byKey.get(key);
      if (recording) break;
    }
    if (!recording && existingUrl) {
      recording = recordings.find((item) => item.recording_url === existingUrl) || null;
    }
    if (!recording) {
      const rowTime = Date.parse(String(row.started_at || row.created_at || ''));
      const rowFrom = normalizePhoneDigits(row.from_number);
      const rowTo = normalizePhoneDigits(row.to_number);
      recording = recordings.find((item) => {
        const itemTime = Date.parse(String(item.recording_date || item.recorded_at || item.created_at || ''));
        if (!Number.isFinite(rowTime) || !Number.isFinite(itemTime) || Math.abs(rowTime - itemTime) > 24 * 60 * 60 * 1000) return false;
        const itemFrom = normalizePhoneDigits(item.from_number);
        const itemTo = normalizePhoneDigits(item.to_number);
        return (!!rowFrom && (rowFrom === itemFrom || rowFrom === itemTo)) || (!!rowTo && (rowTo === itemFrom || rowTo === itemTo));
      }) || null;
    }
    return {
      ...row,
      recording_id: row.recording_id || row.mightycall_recording_id || recording?.id || null,
      recording_url: existingUrl || recording?.recording_url || null,
      has_recording: Boolean(existingUrl || recording?.recording_url || row.has_recording),
    };
  });
}

function normalizeReportCallStatus(row: any) {
  const raw = String(
    row?.status ||
    row?.call_status ||
    row?.call_result ||
    row?.result ||
    row?.disposition ||
    row?.metadata?.status ||
    row?.metadata?.callStatus ||
    row?.metadata?.call_result ||
    row?.metadata?.result ||
    row?.metadata?.disposition ||
    row?.metadata?.finalStatus ||
    row?.metadata?.callInfo?.status ||
    row?.metadata?.callInfo?.result ||
    row?.raw_payload?.status ||
    row?.raw_payload?.callStatus ||
    row?.raw_payload?.call_result ||
    row?.raw_payload?.result ||
    row?.raw_payload?.disposition ||
    row?.raw_payload?.finalStatus ||
    row?.raw_payload?.callInfo?.status ||
    row?.raw_payload?.callInfo?.result ||
    row?.raw_payload?.state ||
    ''
  ).toLowerCase();
  if (raw.includes('answer') || raw.includes('complete') || raw.includes('connect')) return 'answered';
  if (raw.includes('miss')) return 'missed';
  if (raw.includes('abandon')) return 'abandoned';
  if (raw.includes('voice')) return 'voicemail';
  if (raw.includes('fail') || raw.includes('busy') || raw.includes('cancel')) return 'failed';
  const durationSeconds = durationToSeconds(
    row?.duration_seconds ??
    row?.durationSeconds ??
    row?.duration ??
    row?.metadata?.duration_seconds ??
    row?.metadata?.durationSeconds ??
    row?.metadata?.duration ??
    row?.raw_payload?.duration_seconds ??
    row?.raw_payload?.durationSeconds ??
    row?.raw_payload?.duration
  );
  if (durationSeconds > 0 || row?.connected_at || row?.answered_at || row?.metadata?.answered_at || row?.raw_payload?.answered_at) return 'answered';
  return raw || 'unknown';
}

function findTransferInfo(raw: any): { target: string | null; type: string; status: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const directTarget = firstString(
    raw.transfer_target,
    raw.transferTarget,
    raw.transferredTo,
    raw.transfer?.target,
    raw.transfer?.to,
    raw.transfer?.transferredTo
  );
  const directType = firstString(raw.transfer_type, raw.transferType, raw.transfer?.type);
  const directStatus = firstString(raw.transfer_status, raw.transferStatus, raw.transfer?.status, raw.transfer?.result);
  if (directTarget || directType || directStatus) {
    return {
      target: directTarget,
      type: directType || 'unknown',
      status: directStatus || 'unknown',
    };
  }

  const seen = new Set<any>();
  const stack = [raw];
  let target: string | null = null;
  let type: string | null = null;
  let status: string | null = null;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, value] of Object.entries(current)) {
      const lower = key.toLowerCase();
      if (lower.includes('transfer') || lower === 'transferredto') {
        if (typeof value === 'string' || typeof value === 'number') {
          if (lower.includes('target') || lower.includes('to') || lower === 'transferredto') target ||= String(value);
          else if (lower.includes('status') || lower.includes('result')) status ||= String(value);
          else if (lower.includes('type')) type ||= String(value);
          else type ||= String(value);
        } else if (value && typeof value === 'object') {
          target ||= firstString((value as any).target, (value as any).to, (value as any).transferredTo, (value as any).extension, (value as any).number);
          type ||= firstString((value as any).type, (value as any).transferType);
          status ||= firstString((value as any).status, (value as any).result, (value as any).transferStatus);
        }
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  if (!target && !type && !status) return null;
  return { target, type: type || 'unknown', status: status || 'unknown' };
}

function transferRowsFromCalls(calls: any[]) {
  const rows: any[] = [];
  for (const call of calls) {
    const raw = call?.raw_payload || call?.metadata || call;
    const transfer = findTransferInfo(raw);
    if (!transfer) continue;
    rows.push({
      id: `${call.id || call.external_call_id || call.external_id}:transfer`,
      org_id: call.org_id,
      external_call_id: call.external_call_id || call.external_id || call.id,
      transferred_at: call.ended_at || call.started_at || call.created_at,
      from_number: call.from_number,
      to_number: call.to_number,
      business_number: call.business_number,
      original_caller: call.from_number,
      original_receiving_number: call.to_number || call.business_number,
      agent_extension: rowAgentExtension(call),
      extension: rowAgentExtension(call),
      transfer_target: transfer.target,
      transfer_type: transfer.type,
      transfer_status: transfer.status,
      result: transfer.status,
      raw_payload: raw,
    });
  }
  return rows;
}

function ownedDigitsForScope(phones: Array<{ digits: string }>, scope: ReportScope) {
  return new Set([
    ...phones.map((phone) => phone.digits).filter(Boolean),
    ...Array.from(scope.allowedPhoneDigits || []),
    ...Array.from(scope.requestedPhoneDigits || []),
  ]);
}

async function handle(req: express.Request, res: express.Response, fn: (scope: ReportScope) => Promise<void>) {
  try {
    const scope = await resolveScope(req);
    await fn(scope);
  } catch (err: any) {
    const status = err?.status || 500;
    res.status(status).json({ error: err?.message || 'reports_error' });
  }
}

router.get('/numbers', (req, res) => handle(req, res, async (scope) => {
  const orgIds = scope.isPlatformAdmin && scope.orgIds.length === 0 ? [] : scope.orgIds;
  let phones = await getOrgPhones(orgIds);
  if (scope.isPlatformAdmin && orgIds.length === 0) {
    phones = await queryPhoneNumbers();
  }
  const rows = scope.isPlatformAdmin || scope.orgWide ? phones : phones.filter((phone) => scope.allowedPhoneIds.has(phone.id));
  const [calls, baseRecordings, baseSms, transfers] = await Promise.all([
    fetchRealCallRows(req, scope, 10000, { skipDirection: true }),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const normalizedCalls = normalizeCallRows(calls, ownedDigits);
  const transferRows = transfers.length > 0 ? transfers : applyCommonFilters(transferRowsFromCalls(calls), req, scope);
  const recordings = normalizeRecordingRows(baseRecordings, ownedDigits);
  const sms = normalizeSmsDirections(baseSms, new Set(phones.map((phone) => phone.digits).filter(Boolean)));
  const numbers = rows.map((phone) => {
    const matches = (row: any) => rowMatchesDigits(row, new Set([phone.digits]));
    const phoneCalls = normalizedCalls.filter(matches);
    return {
      ...phone,
      calls: phoneCalls.length,
      answered: phoneCalls.filter((row) => statusOf(row).includes('answer') || statusOf(row).includes('complete')).length,
      missed: phoneCalls.filter((row) => statusOf(row).includes('miss')).length,
      sms: sms.filter(matches).length,
      transfers: transferRows.filter(matches).length,
      recordings: recordings.filter(matches).length,
    };
  });
  res.json({ numbers });
}));

router.get('/calls', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const rows = await enrichCallsWithRecordingLinks(
    normalizeCallRows(await fetchRealCallRows(req, scope, 10000, { skipDirection: true }), ownedDigits),
    req,
    scope,
    ownedDigits
  );
  const requestedDirection = String(req.query.direction || '').toLowerCase();
  const filteredRows = requestedDirection && requestedDirection !== 'all'
    ? rows.filter((row) => directionOf(row) === requestedDirection)
    : rows;
  const page = paginate(req, filteredRows);
  res.json({ calls: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/recordings', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const recordingTableRows = await fetchTableRows('mightycall_recordings', 'recording_date', req, scope, 10000, { skipDirection: true, skipStatus: true, skipAgent: true });
  let rows = normalizeRecordingRows(recordingTableRows, ownedDigits);
  const requestedDirection = String(req.query.direction || '').toLowerCase();
  if (requestedDirection && requestedDirection !== 'all') rows = rows.filter((row) => row.direction === requestedDirection);
  const page = paginate(req, rows);
  res.json({ recordings: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/sms', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const requestedDirection = String(req.query.direction || '').toLowerCase();
  let rows = normalizeSmsDirections(await fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }), ownedDigits);
  if (requestedDirection && requestedDirection !== 'all') {
    rows = rows.filter((row) => directionOf(row) === requestedDirection);
  }
  const page = paginate(req, rows);
  res.json({ sms: page.rows, messages: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/transfers', (req, res) => handle(req, res, async (scope) => {
  let rows = await fetchTableRows('call_transfers', 'transferred_at', req, scope);
  if (rows.length === 0) {
    const calls = await fetchRealCallRows(req, scope, 10000, { skipDirection: true });
    rows = applyCommonFilters(transferRowsFromCalls(calls), req, scope);
  }
  const page = paginate(req, rows);
  res.json({ transfers: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/agents', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const [calls, recordings, sms, transfers] = await Promise.all([
    fetchRealCallRows(req, scope, 10000, { skipDirection: true }),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const transferRows = transfers.length > 0 ? transfers : applyCommonFilters(transferRowsFromCalls(calls), req, scope);
  const agents = groupAgentStats([...normalizeCallRows(calls, ownedDigits), ...recordings, ...sms], transferRows, await loadAgentIdentityMap(scope));
  res.json({ agents });
}));

router.get('/overview', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = ownedDigitsForScope(phones, scope);
  const [baseCalls, baseRecordings, baseSms, transfers] = await Promise.all([
    fetchRealCallRows(req, scope, 10000, { skipDirection: true }),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const calls = normalizeCallRows(baseCalls, ownedDigits);
  const transferRows = transfers.length > 0 ? transfers : applyCommonFilters(transferRowsFromCalls(baseCalls), req, scope);
  const recordings = normalizeRecordingRows(baseRecordings, ownedDigits);
  const sms = normalizeSmsDirections(baseSms, ownedDigits);
  const answered = calls.filter((row) => statusOf(row).includes('answer') || statusOf(row).includes('complete')).length;
  const missed = calls.filter((row) => statusOf(row).includes('miss')).length;
  const abandoned = calls.filter((row) => statusOf(row).includes('abandon')).length;
  const inboundSms = sms.reduce((sum, row) => sum + (row.inbound_count ? safeNumber(row.inbound_count) : (directionOf(row) === 'inbound' ? 1 : 0)), 0);
  const outboundSms = sms.reduce((sum, row) => sum + (row.outbound_count ? safeNumber(row.outbound_count) : (directionOf(row) === 'outbound' ? 1 : 0)), 0);
  const agentStats = groupAgentStats([...calls, ...recordings, ...sms], transferRows, await loadAgentIdentityMap(scope), 10);
  const overview = {
    total_calls: calls.length,
    answered_calls: answered,
    missed_calls: missed,
    abandoned_calls: abandoned,
    avg_duration_seconds: calls.length > 0 ? avg(calls.map((row) => safeNumber(row.duration_seconds))) : 0,
    avg_wait_seconds: avg(calls.map((row) => safeNumber(row.wait_seconds || row.queue_wait_seconds || row.metadata?.wait_seconds))),
    total_recordings: recordings.length,
    total_sms: sms.reduce((sum, row) => sum + (row.messages_count ? safeNumber(row.messages_count) : 1), 0),
    inbound_sms: inboundSms,
    outbound_sms: outboundSms,
    total_transfers: transferRows.length,
    transfers_by_number: groupBusinessNumberCounts(transferRows, phones),
    top_agents: agentStats,
    top_numbers: groupBusinessNumberCounts(calls, phones),
  };
  try {
    const { data: latest } = await supabaseAdmin
      .from('mightycall_sync_runs')
      .select('finished_at, started_at, status, raw_result, detail')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    (overview as any).latest_sync = latest || null;
  } catch {
    (overview as any).latest_sync = null;
  }
  res.json({ overview });
}));

export default router;
