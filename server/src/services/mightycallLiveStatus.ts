import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_BASE_URL } from '../config/env';
import {
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

  // Official endpoint first: GET /profile/status?extension={ext}
  // Reference: MightyCall API docs and support documentation for profile status.
  let profile = await withTimeout(
    fetchOfficialProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
    2000,
    null
  );
  if (!profile) {
    profile = await withTimeout(
      fetchMightyCallProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      2200,
      null
    );
  }

  // Optional active-call overlay for ringing/dialing detail while status endpoint is between transitions.
  const liveCall = await withTimeout(
    fetchMightyCallLiveCallByExtension(extension, token, apiKeyOverride).catch(() => null),
    1800,
    null
  );
  const currentCall = liveCall?.currentCall || profile?.currentCall || profile?.current_call || null;

  const rawStatus = extractStatusText(profile) || extractStatusText(currentCall) || 'Unknown';
  let normalizedStatus = normalizeFromRawStatus(rawStatus);

  if (liveCall?.onCall && currentCall) {
    const callStatusText = extractStatusText(currentCall);
    const byCall = normalizeFromRawStatus(callStatusText);
    if (byCall === 'ringing' || byCall === 'dialing') normalizedStatus = byCall;
    else normalizedStatus = 'on_call';
  }

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
    },
    source: 'mightycall_user_status_by_extension',
    direction: deriveDirection(currentCall?.direction || currentCall?.callDirection || profile?.direction),
    counterpartNumber: firstText(
      currentCall?.from_number,
      currentCall?.from,
      currentCall?.caller?.number,
      currentCall?.to_number,
      currentCall?.to,
      currentCall?.called?.number,
      currentCall?.client?.address
    ) || null,
    currentCallId: String(currentCall?.id || currentCall?.callId || '').trim() || null,
  };
}
