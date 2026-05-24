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

function rowTimestamp(row: any): string | null {
  return firstString(row.started_at, row.recording_date, row.sent_at, row.message_date, row.transferred_at, row.created_at);
}

function rowNumbers(row: any): string[] {
  const metadata = row?.metadata || row?.raw_payload || {};
  const values = [
    row?.phone_number,
    row?.from_number,
    row?.to_number,
    row?.original_caller,
    row?.original_receiving_number,
    row?.transfer_target,
    metadata?.phone_number,
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
  return String(row?.direction || row?.current_call_direction || row?.metadata?.direction || '').toLowerCase();
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
  const { data, error } = await supabaseAdmin
    .from('phone_numbers')
    .select('id, org_id, number, label, number_digits, e164, phone_number')
    .in('org_id', orgIds);
  if (error) throw error;
  return (data || []).map((row: any) => ({
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
    requestedPhoneDigits,
  };
}

function applyCommonFilters(rows: any[], req: express.Request, scope: ReportScope) {
  const direction = String(req.query.direction || '').toLowerCase();
  const status = String(req.query.status || '').toLowerCase();
  const agent = String(req.query.agent || req.query.extension || '').replace(/\D/g, '');
  const search = String(req.query.search || '').trim().toLowerCase();
  const numberDigits = scope.requestedPhoneDigits.size > 0 ? scope.requestedPhoneDigits : scope.allowedPhoneDigits;

  return rows.filter((row) => {
    if (!scope.isPlatformAdmin && !rowMatchesDigits(row, numberDigits)) return false;
    if (scope.isPlatformAdmin && scope.requestedPhoneDigits.size > 0 && !rowMatchesDigits(row, scope.requestedPhoneDigits)) return false;
    if (direction && direction !== 'all' && directionOf(row) !== direction) return false;
    if (status && status !== 'all' && statusOf(row) !== status) return false;
    if (agent) {
      const rowAgent = String(row?.agent_extension || row?.mightycall_extension || row?.metadata?.agent_extension || row?.raw_payload?.agent_extension || '').replace(/\D/g, '');
      if (rowAgent !== agent) return false;
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

async function fetchTableRows(table: string, dateColumn: string, req: express.Request, scope: ReportScope, max = 10000) {
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
  return applyCommonFilters(data || [], req, scope);
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
    const { data, error } = await supabaseAdmin.from('phone_numbers').select('id, org_id, number, label, number_digits, e164, phone_number');
    if (error) throw error;
    phones = (data || []).map((row: any) => ({
      id: String(row.id || ''),
      org_id: String(row.org_id || ''),
      number: String(row.number || row.e164 || row.phone_number || ''),
      label: row.label || null,
      digits: normalizePhoneDigits(row.number_digits || row.number || row.e164 || row.phone_number) || '',
    })).filter((row) => row.org_id && row.digits);
  }
  const rows = scope.isPlatformAdmin || scope.orgWide ? phones : phones.filter((phone) => scope.allowedPhoneIds.has(phone.id));
  res.json({ numbers: rows });
}));

router.get('/calls', (req, res) => handle(req, res, async (scope) => {
  const rows = await fetchTableRows('calls', 'started_at', req, scope);
  const page = paginate(req, rows);
  res.json({ calls: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/recordings', (req, res) => handle(req, res, async (scope) => {
  const rows = await fetchTableRows('mightycall_recordings', 'recording_date', req, scope);
  const page = paginate(req, rows);
  res.json({ recordings: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/sms', (req, res) => handle(req, res, async (scope) => {
  const rows = await fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope);
  const page = paginate(req, rows);
  res.json({ sms: page.rows, messages: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/transfers', (req, res) => handle(req, res, async (scope) => {
  const rows = await fetchTableRows('call_transfers', 'transferred_at', req, scope);
  const page = paginate(req, rows);
  res.json({ transfers: page.rows, total: page.total, next_offset: page.next_offset });
}));

router.get('/agents', (req, res) => handle(req, res, async (scope) => {
  const [calls, transfers] = await Promise.all([
    fetchTableRows('calls', 'started_at', req, scope),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const byAgent = new Map<string, any>();
  for (const call of calls) {
    const extension = String(call.agent_extension || call.mightycall_extension || call.metadata?.agent_extension || '').replace(/\D/g, '') || 'unknown';
    const current = byAgent.get(extension) || { extension, total_calls: 0, answered_calls: 0, missed_calls: 0, total_duration_seconds: 0, transfers: 0 };
    current.total_calls += 1;
    if (statusOf(call).includes('answer') || statusOf(call).includes('complete')) current.answered_calls += 1;
    if (statusOf(call).includes('miss')) current.missed_calls += 1;
    current.total_duration_seconds += safeNumber(call.duration_seconds);
    byAgent.set(extension, current);
  }
  for (const transfer of transfers) {
    const extension = String(transfer.agent_extension || transfer.mightycall_extension || '').replace(/\D/g, '') || 'unknown';
    const current = byAgent.get(extension) || { extension, total_calls: 0, answered_calls: 0, missed_calls: 0, total_duration_seconds: 0, transfers: 0 };
    current.transfers += 1;
    byAgent.set(extension, current);
  }
  const agents = Array.from(byAgent.values()).map((row) => ({
    ...row,
    avg_duration_seconds: row.total_calls > 0 ? Math.round(row.total_duration_seconds / row.total_calls) : 0,
  })).sort((a, b) => b.total_calls - a.total_calls);
  res.json({ agents });
}));

router.get('/overview', (req, res) => handle(req, res, async (scope) => {
  const [calls, recordings, sms, transfers] = await Promise.all([
    fetchTableRows('calls', 'started_at', req, scope),
    fetchTableRows('mightycall_recordings', 'recording_date', req, scope),
    fetchTableRows('mightycall_sms_messages', 'sent_at', req, scope),
    fetchTableRows('call_transfers', 'transferred_at', req, scope),
  ]);
  const answered = calls.filter((row) => statusOf(row).includes('answer') || statusOf(row).includes('complete')).length;
  const missed = calls.filter((row) => statusOf(row).includes('miss')).length;
  const abandoned = calls.filter((row) => statusOf(row).includes('abandon')).length;
  const inboundSms = sms.filter((row) => directionOf(row) === 'inbound').length;
  const outboundSms = sms.filter((row) => directionOf(row) === 'outbound').length;
  const overview = {
    total_calls: calls.length,
    answered_calls: answered,
    missed_calls: missed,
    abandoned_calls: abandoned,
    avg_duration_seconds: avg(calls.map((row) => safeNumber(row.duration_seconds))),
    avg_wait_seconds: avg(calls.map((row) => safeNumber(row.wait_seconds || row.queue_wait_seconds || row.metadata?.wait_seconds))),
    total_recordings: recordings.length,
    total_sms: sms.length,
    inbound_sms: inboundSms,
    outbound_sms: outboundSms,
    total_transfers: transfers.length,
    transfers_by_number: groupCount(transfers, (row) => row.original_receiving_number || row.to_number || row.transfer_target),
    top_agents: groupCount(calls, (row) => String(row.agent_extension || row.mightycall_extension || row.metadata?.agent_extension || '').replace(/\D/g, '') || null),
    top_numbers: groupCount([...calls, ...recordings, ...sms], (row) => rowNumbers(row).find((value) => (normalizePhoneDigits(value) || '').length >= 7) || null),
  };
  res.json({ overview });
}));

export default router;
