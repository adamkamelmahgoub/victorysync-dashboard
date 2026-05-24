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
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const parts = text.split(':').map((part) => Number(part));
  if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
    return Math.max(0, Math.round(parts.reduce((total, part) => total * 60 + part, 0)));
  }
  return 0;
}

function rowTimestamp(row: any): string | null {
  return firstString(row.started_at, row.recording_date, row.sent_at, row.message_date, row.transferred_at, row.created_at);
}

function rowNumbers(row: any): string[] {
  const metadata = row?.metadata || row?.raw_payload || {};
  const values = [
    row?.phone_number,
    row?.business_number,
    row?.from_number,
    row?.to_number,
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
  ];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function rowMatchesDigits(row: any, digits: Set<string>): boolean {
  if (digits.size === 0) return true;
  const rowDigits = rowNumbers(row).map((value) => normalizePhoneDigits(value)).filter((value): value is string => !!value);
  return rowDigits.some((value) => digits.has(value));
}

function statusOf(row: any): string {
  return String(row?.status || row?.result || row?.call_status || row?.metadata?.status || '').toLowerCase();
}

function directionOf(row: any): string {
  const raw = String(row?.direction || row?.current_call_direction || row?.metadata?.direction || row?.metadata?.origin || row?.raw_payload?.origin || '').toLowerCase();
  if (raw.includes('out')) return 'outbound';
  if (raw.includes('in')) return 'inbound';
  return raw;
}

function rowAgentExtension(row: any): string {
  return String(
    row?.agent_extension ||
    row?.mightycall_extension ||
    row?.extension ||
    row?.metadata?.agent_extension ||
    row?.metadata?.mightycall_extension ||
    row?.metadata?.agent?.extension ||
    row?.metadata?.users?.[0]?.extension ||
    row?.raw_payload?.agent_extension ||
    row?.raw_payload?.agent?.extension ||
    row?.raw_payload?.users?.[0]?.extension ||
    ''
  ).replace(/\D/g, '');
}

function inferDirectionFromOwnedNumbers(row: any, ownedDigits: Set<string>): 'inbound' | 'outbound' | 'unknown' {
  const explicit = directionOf(row);
  const origin = String(
    row?.origin ||
    row?.message_origin ||
    row?.metadata?.origin ||
    row?.metadata?.messageInfo?.origin ||
    row?.raw_payload?.origin ||
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

function applyCommonFilters(rows: any[], req: express.Request, scope: ReportScope, options: { skipDirection?: boolean } = {}) {
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
    if (status && status !== 'all' && statusOf(row) !== status) return false;
    if (agent) {
      if (rowAgentExtension(row) !== agent) return false;
    }
    if (search) {
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

async function fetchTableRows(table: string, dateColumn: string, req: express.Request, scope: ReportScope, max = 10000, options: { skipDirection?: boolean } = {}) {
  if (!scope.isPlatformAdmin && scope.orgIds.length === 0) return [];
  const start = asDateParam(req.query.start_date || req.query.from);
  const end = asDateParam(req.query.end_date || req.query.to, true);
  let query = supabaseAdmin.from(table).select('*');
  if (scope.orgIds.length > 0) query = query.in('org_id', scope.orgIds);
  if (start) query = query.gte(dateColumn, start);
  if (end) query = query.lte(dateColumn, end);
  query = query.order(dateColumn, { ascending: false }).limit(max);
  const { data, error } = await query;
  if (error) {
    if (error.code === 'PGRST205' || /not exist|schema cache/i.test(error.message || '')) return [];
    throw error;
  }
  return applyCommonFilters(data || [], req, scope, options);
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

async function fetchLegacyMightyCallReports(reportType: string, req: express.Request, scope: ReportScope) {
  if (!scope.isPlatformAdmin && scope.orgIds.length === 0) return [];
  const start = asDateParam(req.query.start_date || req.query.from);
  const end = asDateParam(req.query.end_date || req.query.to, true);
  let query = supabaseAdmin.from('mightycall_reports').select('*').eq('report_type', reportType);
  if (scope.orgIds.length > 0) query = query.in('org_id', scope.orgIds);
  if (start) query = query.gte('report_date', start.slice(0, 10));
  if (end) query = query.lte('report_date', end.slice(0, 10));
  const { data, error } = await query.order('report_date', { ascending: false }).limit(5000);
  if (error) {
    if (error.code === 'PGRST205' || /not exist|schema cache/i.test(error.message || '')) return [];
    throw error;
  }
  const numberDigits = scope.requestedPhoneDigits.size > 0 ? scope.requestedPhoneDigits : scope.allowedPhoneDigits;
  if (!scope.isPlatformAdmin && !scope.orgWide && numberDigits.size === 0) return [];
  return (data || []).filter((row: any) => {
    const sampleNumbers = Array.isArray(row?.data?.sample_numbers) ? row.data.sample_numbers : [];
    if (!scope.isPlatformAdmin && numberDigits.size > 0) {
      const digits = sampleNumbers.map((value: any) => normalizePhoneDigits(value)).filter(Boolean);
      if (!digits.some((value: any) => numberDigits.has(value))) return false;
    }
    if (scope.isPlatformAdmin && scope.requestedPhoneDigits.size > 0) {
      const digits = sampleNumbers.map((value: any) => normalizePhoneDigits(value)).filter(Boolean);
      if (!digits.some((value: any) => scope.requestedPhoneDigits.has(value))) return false;
    }
    return true;
  });
}

function legacyCallRows(reports: any[]) {
  const out: any[] = [];
  for (const report of reports) {
    const data = report?.data || {};
    const samples = Array.isArray(data.sample_activity) ? data.sample_activity : [];
    if (samples.length > 0) {
      for (const sample of samples) {
        out.push({
          id: `${report.id || report.report_date}:${sample.id || out.length}`,
          org_id: report.org_id,
          started_at: sample.created || report.report_date,
          from_number: sample.from_number || null,
          to_number: sample.to_number || null,
          duration_seconds: safeNumber(sample.duration_seconds),
          status: sample.status || 'unknown',
          direction: 'unknown',
          metadata: { source: 'mightycall_reports', report_id: report.id },
        });
      }
    } else {
      out.push({
        id: report.id,
        org_id: report.org_id,
        started_at: report.report_date,
        from_number: Array.isArray(data.sample_numbers) ? data.sample_numbers[0] : null,
        to_number: Array.isArray(data.sample_numbers) ? data.sample_numbers[1] : null,
        duration_seconds: safeNumber(data.total_duration),
        status: 'summary',
        direction: 'unknown',
        calls_count: safeNumber(data.calls_count),
        answered_count: safeNumber(data.answered_count),
        missed_count: safeNumber(data.missed_count),
        metadata: { source: 'mightycall_reports', report_id: report.id },
      });
    }
  }
  return out;
}

function legacyOverviewFromReports(reports: any[]) {
  return reports.reduce((acc, report) => {
    const data = report?.data || {};
    acc.total += safeNumber(data.calls_count);
    acc.answered += safeNumber(data.answered_count);
    acc.missed += safeNumber(data.missed_count);
    acc.duration += safeNumber(data.total_duration);
    return acc;
  }, { total: 0, answered: 0, missed: 0, duration: 0 });
}

function legacyMessageRows(reports: any[], ownedDigits: Set<string>) {
  const out: any[] = [];
  for (const report of reports) {
    const data = report?.data || {};
    const samples = Array.isArray(data.sample_activity) ? data.sample_activity : [];
    if (samples.length > 0) {
      for (const sample of samples) {
        const row = {
          id: `${report.id || report.report_date}:${sample.id || out.length}`,
          org_id: report.org_id,
          sent_at: sample.created || report.report_date,
          message_date: sample.created || report.report_date,
          from_number: sample.from_number || null,
          to_number: sample.to_number || null,
          business_number: sample.business_number || null,
          message_text: sample.message_text || sample.text || null,
          status: sample.status || 'unknown',
          direction: sample.direction || 'unknown',
          metadata: { source: 'mightycall_reports', report_id: report.id, ...sample },
        };
        out.push({ ...row, direction: inferDirectionFromOwnedNumbers(row, ownedDigits) });
      }
    } else {
      const row = {
        id: report.id,
        org_id: report.org_id,
        sent_at: report.report_date,
        message_date: report.report_date,
        from_number: Array.isArray(data.sample_numbers) ? data.sample_numbers[0] : null,
        to_number: Array.isArray(data.sample_numbers) ? data.sample_numbers[1] : null,
        message_text: null,
        status: 'summary',
        direction: 'unknown',
        messages_count: safeNumber(data.messages_count),
        inbound_count: safeNumber(data.inbound_count),
        outbound_count: safeNumber(data.outbound_count),
        metadata: { source: 'mightycall_reports', report_id: report.id },
      };
      out.push({ ...row, direction: inferDirectionFromOwnedNumbers(row, ownedDigits) });
    }
  }
  return out;
}

function normalizeSmsDirections(rows: any[], ownedDigits: Set<string>) {
  return rows.map((row) => ({
    ...row,
    direction: inferDirectionFromOwnedNumbers(row, ownedDigits),
  }));
}

function normalizeRecordingRows(rows: any[], ownedDigits: Set<string>) {
  return rows.map((row) => {
    const metadata = row?.metadata || row?.raw_payload || {};
    const businessNumber = row.business_number || metadata?.businessNumber?.number || metadata?.phone_number || null;
    const clientNumber = metadata?.client?.address || metadata?.client?.number || metadata?.caller_number || row.from_number || metadata?.from_number || null;
    const origin = String(metadata?.origin || row.direction || '').toLowerCase();
    const fromNumber = origin.includes('out')
      ? (businessNumber || row.from_number || metadata?.from_number || null)
      : (row.from_number || metadata?.from_number || metadata?.client?.address || null);
    const toNumber = origin.includes('out')
      ? (clientNumber || row.to_number || metadata?.to_number || null)
      : (row.to_number || metadata?.to_number || metadata?.businessNumber?.number || null);
    return {
      ...row,
      from_number: fromNumber,
      to_number: toNumber,
      business_number: businessNumber,
      direction: inferDirectionFromOwnedNumbers({ ...row, from_number: fromNumber, to_number: toNumber, business_number: businessNumber, metadata }, ownedDigits),
      duration_seconds: durationToSeconds(row.duration_seconds || metadata?.recording?.duration || metadata?.duration_seconds || metadata?.duration || metadata?.callDuration),
    };
  });
}

async function callRecordingRows(req: express.Request, scope: ReportScope) {
  const rows = await fetchTableRows('calls', 'started_at', req, scope);
  return rows.filter((row) => row.recording_url || row.has_recording).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    external_id: row.external_id,
    external_call_id: row.external_call_id || row.external_id,
    recording_date: row.started_at,
    recorded_at: row.started_at,
    from_number: row.from_number,
    to_number: row.to_number,
    business_number: row.business_number || row.to_number,
    direction: row.direction || 'unknown',
    duration_seconds: row.duration_seconds || 0,
    recording_url: row.recording_url || null,
    extension: row.extension || row.agent_extension || null,
    metadata: { source: 'calls.recording_url', call_id: row.id },
  }));
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
    fetchTableRows('calls', 'started_at', req, scope),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const recordings = baseRecordings.length ? baseRecordings : await callRecordingRows(req, scope);
  const sms = normalizeSmsDirections(baseSms, new Set(phones.map((phone) => phone.digits).filter(Boolean)));
  const numbers = rows.map((phone) => {
    const matches = (row: any) => rowMatchesDigits(row, new Set([phone.digits]));
    const phoneCalls = calls.filter(matches);
    return {
      ...phone,
      calls: phoneCalls.length,
      answered: phoneCalls.filter((row) => statusOf(row).includes('answer') || statusOf(row).includes('complete')).length,
      missed: phoneCalls.filter((row) => statusOf(row).includes('miss')).length,
      sms: sms.filter(matches).length,
      transfers: transfers.filter(matches).length,
      recordings: recordings.filter(matches).length,
    };
  });
  res.json({ numbers });
}));

router.get('/calls', (req, res) => handle(req, res, async (scope) => {
  let rows = await fetchTableRows('calls', 'started_at', req, scope);
  if (rows.length === 0) rows = legacyCallRows(await fetchLegacyMightyCallReports('calls', req, scope));
  const page = paginate(req, rows);
  res.json({ calls: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/recordings', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = new Set(phones.map((phone) => phone.digits).filter(Boolean));
  let rows = await fetchTableRows('mightycall_recordings', 'recording_date', req, scope);
  if (rows.length === 0) rows = await callRecordingRows(req, scope);
  rows = normalizeRecordingRows(rows, ownedDigits);
  const page = paginate(req, rows);
  res.json({ recordings: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/sms', (req, res) => handle(req, res, async (scope) => {
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = new Set(phones.map((phone) => phone.digits).filter(Boolean));
  const requestedDirection = String(req.query.direction || '').toLowerCase();
  let rows = normalizeSmsDirections(await fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }), ownedDigits);
  if (rows.length === 0) rows = legacyMessageRows(await fetchLegacyMightyCallReports('messages', req, scope), ownedDigits);
  if (requestedDirection && requestedDirection !== 'all') {
    rows = rows.filter((row) => directionOf(row) === requestedDirection);
  }
  const page = paginate(req, rows);
  res.json({ sms: page.rows, messages: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/transfers', (req, res) => handle(req, res, async (scope) => {
  const rows = await fetchTableRows('call_transfers', 'transferred_at', req, scope);
  const page = paginate(req, rows);
  res.json({ transfers: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/agents', (req, res) => handle(req, res, async (scope) => {
  const [calls, recordings, sms, transfers] = await Promise.all([
    fetchTableRows('calls', 'started_at', req, scope),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const agents = groupAgentStats([...calls, ...recordings, ...sms], transfers, await loadAgentIdentityMap(scope));
  res.json({ agents });
}));

router.get('/overview', (req, res) => handle(req, res, async (scope) => {
  const [calls, baseRecordings, baseSms, transfers] = await Promise.all([
    fetchTableRows('calls', 'started_at', req, scope),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope, 10000, { skipDirection: true }),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const phones = scope.orgIds.length > 0 ? await queryPhoneNumbers(scope.orgIds) : await queryPhoneNumbers();
  const ownedDigits = new Set(phones.map((phone) => phone.digits).filter(Boolean));
  const recordings = normalizeRecordingRows(baseRecordings.length ? baseRecordings : await callRecordingRows(req, scope), ownedDigits);
  const legacyMessageReports = baseSms.length === 0 ? await fetchLegacyMightyCallReports('messages', req, scope) : [];
  const sms = baseSms.length > 0 ? normalizeSmsDirections(baseSms, ownedDigits) : legacyMessageRows(legacyMessageReports, ownedDigits);
  const answered = calls.filter((row) => statusOf(row).includes('answer') || statusOf(row).includes('complete')).length;
  const missed = calls.filter((row) => statusOf(row).includes('miss')).length;
  const abandoned = calls.filter((row) => statusOf(row).includes('abandon')).length;
  const inboundSms = sms.reduce((sum, row) => sum + (row.inbound_count ? safeNumber(row.inbound_count) : (directionOf(row) === 'inbound' ? 1 : 0)), 0);
  const outboundSms = sms.reduce((sum, row) => sum + (row.outbound_count ? safeNumber(row.outbound_count) : (directionOf(row) === 'outbound' ? 1 : 0)), 0);
  const legacyReports = calls.length === 0 ? await fetchLegacyMightyCallReports('calls', req, scope) : [];
  const legacy = legacyOverviewFromReports(legacyReports);
  const agentStats = groupAgentStats([...calls, ...recordings, ...sms], transfers, await loadAgentIdentityMap(scope), 10);
  const overview = {
    total_calls: calls.length || legacy.total,
    answered_calls: answered || legacy.answered,
    missed_calls: missed || legacy.missed,
    abandoned_calls: abandoned,
    avg_duration_seconds: calls.length > 0 ? avg(calls.map((row) => safeNumber(row.duration_seconds))) : (legacy.total > 0 ? Math.round(legacy.duration / legacy.total) : 0),
    avg_wait_seconds: avg(calls.map((row) => safeNumber(row.wait_seconds || row.queue_wait_seconds || row.metadata?.wait_seconds))),
    total_recordings: recordings.length,
    total_sms: sms.reduce((sum, row) => sum + (row.messages_count ? safeNumber(row.messages_count) : 1), 0),
    inbound_sms: inboundSms,
    outbound_sms: outboundSms,
    total_transfers: transfers.length,
    transfers_by_number: groupCount(transfers, (row) => row.original_receiving_number || row.to_number || row.transfer_target),
    top_agents: agentStats,
    top_numbers: groupCount([...calls, ...recordings, ...sms], (row) => rowNumbers(row).find((value) => !/[a-z]/i.test(String(value)) && (normalizePhoneDigits(value) || '').length >= 7) || null),
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
