import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_BASE_URL } from '../config/env';
import {
  fetchMightyCallCalls,
  fetchMightyCallLiveCallByExtension,
  fetchMightyCallProfileStatusByExtension,
  getMightyCallAccessToken,
} from '../integrations/mightycall';
import { getOrgIntegration } from '../lib/integrationsStore';

export type NormalizedLiveStatus =
  | 'available'
  | 'ringing'
  | 'dialing'
  | 'on_call'
  | 'wrap_up'
  | 'dnd'
  | 'offline'
  | 'unknown';

export type MightyCallStatusByExtension = {
  extension: string;
  mightycallUserId?: string;
  name?: string;
  email?: string;
  rawStatus: string;
  normalizedStatus: NormalizedLiveStatus;
  statusStartedAt?: string;
  lastSyncedAt: string;
  raw: unknown;
  source: 'mightycall_user_status_by_extension';
  direction?: 'inbound' | 'outbound' | null;
  counterpartNumber?: string | null;
  currentCallId?: string | null;
};

function normalizeExtension(value: any): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits;
}

function firstText(...values: any[]): string {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function firstIso(...values: any[]): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return undefined;
}

function normalizeFromRawStatus(rawStatus: string): NormalizedLiveStatus {
  const text = String(rawStatus || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('ring')) return 'ringing';
  if (text.includes('dial') || text.includes('calling')) return 'dialing';
  if (text.includes('on a call') || text.includes('on call')) return 'on_call';
  if (text.includes('connect') || text.includes('talk') || text.includes('in progress') || text.includes('active call') || text.includes('in call')) return 'on_call';
  if (text.includes('wrap')) return 'wrap_up';
  if (text.includes('do not disturb') || text === 'dnd' || text.includes('disturb')) return 'dnd';
  if (text.includes('offline')) return 'offline';
  if (text.includes('outbound')) return 'available';
  if (text.includes('available') || text.includes('idle') || text.includes('ready')) return 'available';
  return 'unknown';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs));
  return Promise.race([promise, timeout]);
}

function pickProfileStatusPayload(body: any, extension: string): any {
  const data = body?.data ?? body;
  if (!data) return null;
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : null);
  if (rows) {
    return rows.find((item: any) => (
      normalizeExtension(item?.extension || item?.ext || item?.extensionNumber || item?.extension_number) === extension
    )) || rows.find((item: any) => item && typeof item === 'object') || null;
  }
  return typeof data === 'object' ? data : null;
}

async function fetchOfficialProfileStatusByExtension(
  extension: string,
  accessToken: string,
  apiKeyOverride?: string
): Promise<any | null> {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoint = '/profile/status';
  const params = new URLSearchParams({ extension });
  const url = `${base}${endpoint}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1800);
  let res: any;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': apiKeyOverride || MIGHTYCALL_API_KEY || '',
      },
      signal: controller.signal as any,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return pickProfileStatusPayload(body, extension);
}

function deriveDirection(value: any): 'inbound' | 'outbound' | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  return null;
}

function extractStatusText(payload: any): string {
  return firstText(
    payload?.status?.name,
    payload?.status?.label,
    payload?.status?.status,
    payload?.status?.value,
    payload?.status,
    payload?.state,
    payload?.availability,
    payload?.presenceStatus,
    payload?.presence_status,
    payload?.currentStatus?.status,
    payload?.current_status?.status,
    payload?.currentCall?.status,
    payload?.current_call?.status
  );
}

function parseMs(value: any): number | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function isActiveCallStatusText(value: any): boolean {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return false;
  if (text.includes('ring')) return true;
  if (text.includes('dial') || text.includes('calling')) return true;
  if (text.includes('answer')) return true;
  if (text.includes('connect') || text.includes('talk') || text.includes('progress') || text.includes('active')) return true;
  if (text.includes('on call') || text.includes('on a call') || text.includes('in call')) return true;
  return false;
}

function isTerminalCallStatusText(value: any): boolean {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return false;
  if (text.includes('complete') || text.includes('ended') || text.includes('hang')) return true;
  if (text.includes('miss')) return true;
  if (text.includes('fail') || text.includes('busy') || text.includes('cancel')) return true;
  if (text.includes('offline')) return true;
  if (text.includes('available') || text.includes('idle') || text.includes('ready')) return true;
  return false;
}

function payloadHasOnCallBoolean(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const queue: any[] = [payload];
  const keys = new Set(['oncall', 'isoncall', 'incall', 'on_a_call', 'activecall', 'isactivecall']);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || typeof next !== 'object') continue;
    for (const [key, value] of Object.entries(next)) {
      const k = String(key || '').replace(/[^a-zA-Z_]/g, '').toLowerCase();
      if (keys.has(k) && value === true) return true;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function normalizeDirection(value: any): 'inbound' | 'outbound' | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  return null;
}

function pickActiveCallEvidence(rows: any[], extension: string): any | null {
  const now = Date.now();
  const normalizedExt = String(extension || '').trim();
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const rowExt = String(
        row?.extension ||
        row?.agent_extension ||
        row?.agentExtension ||
        row?.operatorExtension ||
        ''
      ).replace(/\D/g, '');
      return !rowExt || rowExt === normalizedExt;
    })
    .filter((row) => {
      const status = String(row?.status || row?.state || row?.callStatus || '').trim();
      const endedAt = row?.ended_at || row?.endedAt || null;
      if (endedAt) return false;
      if (isTerminalCallStatusText(status)) return false;
      if (!isActiveCallStatusText(status)) return false;
      const startedMs = parseMs(row?.started_at || row?.startedAt || row?.dateTimeUtc);
      if (!startedMs) return true;
      const ageMs = now - startedMs;
      return ageMs >= 0 && ageMs <= (2 * 60 * 60 * 1000);
    });

  if (normalizedRows.length === 0) return null;
  normalizedRows.sort((a, b) => (parseMs(b?.started_at || b?.startedAt || b?.dateTimeUtc) || 0) - (parseMs(a?.started_at || a?.startedAt || a?.dateTimeUtc) || 0));
  return normalizedRows[0];
}

export async function getMightyCallStatusByExtension(input: {
  extension: string;
  orgId?: string | null;
}): Promise<MightyCallStatusByExtension> {
  const extension = normalizeExtension(input.extension);
  if (!extension) throw new Error('extension is required');

  let overrideCreds: { clientId?: string; clientSecret?: string } | undefined;
  if (input.orgId) {
    const integ = await getOrgIntegration(input.orgId, 'mightycall').catch(() => null);
    if (integ?.credentials) {
      overrideCreds = {
        clientId: integ.credentials.clientId || integ.credentials.apiKey || undefined,
        clientSecret: integ.credentials.clientSecret || integ.credentials.userKey || undefined,
      };
    }
  }
  const token = await getMightyCallAccessToken(overrideCreds);
  const apiKeyOverride = overrideCreds?.clientId || undefined;

  const callsWindowStart = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
  const callsWindowEnd = new Date(Date.now() + (5 * 60 * 1000)).toISOString();

  // Fetch status sources in parallel to keep within request deadline budget.
  const [officialProfile, fallbackProfile, liveCall, recentCalls] = await Promise.all([
    withTimeout(
      fetchOfficialProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      2500,
      null
    ),
    withTimeout(
      fetchMightyCallProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      2500,
      null
    ),
    withTimeout(
      fetchMightyCallLiveCallByExtension(extension, token, apiKeyOverride).catch(() => null),
      2200,
      null
    ),
    withTimeout(
      fetchMightyCallCalls(token, {
        extension,
        startUtc: callsWindowStart,
        endUtc: callsWindowEnd,
        pageSize: '25',
        maxPages: '1',
        fast: true,
        returnOnFirstSuccess: true,
      }, apiKeyOverride).catch(() => []),
      2300,
      [] as any[]
    ),
  ]);
  const profile = officialProfile || fallbackProfile;
  const currentCall = liveCall?.currentCall || profile?.currentCall || profile?.current_call || null;
  const activeCallEvidence = pickActiveCallEvidence(recentCalls as any[], extension);

  const rawStatus = extractStatusText(profile) || extractStatusText(currentCall) || 'Unknown';
  let normalizedStatus = normalizeFromRawStatus(rawStatus);

  const onCallBoolean = payloadHasOnCallBoolean(profile) || payloadHasOnCallBoolean(currentCall);
  if (onCallBoolean && (normalizedStatus === 'available' || normalizedStatus === 'unknown')) {
    normalizedStatus = 'on_call';
  }

  if (liveCall?.onCall && currentCall) {
    const callStatusText = extractStatusText(currentCall);
    const byCall = normalizeFromRawStatus(callStatusText);
    if (byCall === 'ringing' || byCall === 'dialing') normalizedStatus = byCall;
    else normalizedStatus = 'on_call';
  }

  if (activeCallEvidence && (normalizedStatus === 'available' || normalizedStatus === 'unknown')) {
    const byEvidence = normalizeFromRawStatus(String(activeCallEvidence?.status || activeCallEvidence?.state || activeCallEvidence?.callStatus || ''));
    normalizedStatus = byEvidence === 'unknown' ? 'on_call' : byEvidence;
  }

  const effectiveDirection = deriveDirection(
    currentCall?.direction ||
    currentCall?.callDirection ||
    profile?.direction ||
    activeCallEvidence?.direction ||
    activeCallEvidence?.callDirection
  ) || normalizeDirection(activeCallEvidence?.direction || activeCallEvidence?.callDirection);

  const effectiveCounterpart = firstText(
    currentCall?.from_number,
    currentCall?.from,
    currentCall?.caller?.number,
    currentCall?.to_number,
    currentCall?.to,
    currentCall?.called?.number,
    currentCall?.client?.address,
    activeCallEvidence?.from_number,
    activeCallEvidence?.from,
    activeCallEvidence?.to_number,
    activeCallEvidence?.to
  ) || null;

  const effectiveCurrentCallId = String(
    currentCall?.id ||
    currentCall?.callId ||
    activeCallEvidence?.id ||
    activeCallEvidence?.callId ||
    ''
  ).trim() || null;

  return {
    extension,
    mightycallUserId: String(
      profile?.id ||
      profile?.userId ||
      profile?.user_id ||
      profile?.memberId ||
      profile?.member_id ||
      ''
    ).trim() || undefined,
    name: firstText(
      profile?.displayName,
      profile?.display_name,
      profile?.name,
      profile?.fullName,
      profile?.full_name
    ) || undefined,
    email: firstText(profile?.email, profile?.login, profile?.user?.email, profile?.member?.email) || undefined,
    rawStatus,
    normalizedStatus,
    statusStartedAt: firstIso(
      currentCall?.startedAt,
      currentCall?.started_at,
      currentCall?.dateTimeUtc,
      profile?.statusStartedAt,
      profile?.status_started_at,
      profile?.updatedAt,
      profile?.updated_at
    ),
    lastSyncedAt: new Date().toISOString(),
    raw: {
      profileStatus: profile || null,
      liveCall: liveCall || null,
      activeCallEvidence: activeCallEvidence || null,
    },
    source: 'mightycall_user_status_by_extension',
    direction: effectiveDirection,
    counterpartNumber: effectiveCounterpart,
    currentCallId: effectiveCurrentCallId,
  };
}
