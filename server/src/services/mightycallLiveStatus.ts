import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_BASE_URL } from '../config/env';
import {
  fetchMightyCallCalls,
  fetchMightyCallContactCenterCommunications,
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
  | 'on_hold'
  | 'transferring'
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
  decisionReason?: string;
  evidenceAgeMs?: number | null;
  resolverVersion?: string;
  profileStatusNorm?: NormalizedLiveStatus;
  hasDirectLiveCallObject?: boolean;
  activeEvidenceFresh?: boolean;
  activeEvidenceMatched?: boolean;
  activeEvidenceExpiredByDuration?: boolean;
};

const LIVE_STATUS_RESOLVER_VERSION = 'deterministic_v2';
const LIVE_EVIDENCE_FRESH_MS = 8_000; // 8s: completed call records must not linger as "active" signal
const LIVE_DURATION_PROGRESS_WINDOW_MS = 25_000;
const LIVE_DURATION_MAP_TTL_MS = 10 * 60 * 1000;
const liveDurationProgressByCallId = new Map<string, {
  lastDurationSec: number | null;
  lastSeenAtMs: number;
  lastProgressAtMs: number;
}>();

function pruneLiveDurationProgress(nowMs: number) {
  for (const [callId, row] of liveDurationProgressByCallId.entries()) {
    if ((nowMs - row.lastSeenAtMs) > LIVE_DURATION_MAP_TTL_MS) {
      liveDurationProgressByCallId.delete(callId);
    }
  }
}

function trackDurationProgress(callId: string | null, durationSec: number | null, nowMs: number): {
  hasRecentProgress: boolean;
  firstSeen: boolean;
} {
  pruneLiveDurationProgress(nowMs);
  if (!callId) return { hasRecentProgress: false, firstSeen: false };
  const prev = liveDurationProgressByCallId.get(callId);
  if (!prev) {
    liveDurationProgressByCallId.set(callId, {
      lastDurationSec: durationSec,
      lastSeenAtMs: nowMs,
      lastProgressAtMs: nowMs,
    });
    return { hasRecentProgress: true, firstSeen: true };
  }

  let lastProgressAtMs = prev.lastProgressAtMs;
  if (
    durationSec != null &&
    prev.lastDurationSec != null &&
    durationSec > prev.lastDurationSec
  ) {
    lastProgressAtMs = nowMs;
  }

  if (
    durationSec != null &&
    prev.lastDurationSec == null
  ) {
    lastProgressAtMs = nowMs;
  }

  liveDurationProgressByCallId.set(callId, {
    lastDurationSec: durationSec ?? prev.lastDurationSec,
    lastSeenAtMs: nowMs,
    lastProgressAtMs,
  });

  return {
    hasRecentProgress: (nowMs - lastProgressAtMs) <= LIVE_DURATION_PROGRESS_WINDOW_MS,
    firstSeen: false,
  };
}

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

function firstObject(...values: any[]): any | null {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return null;
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

export function normalizeFromRawStatus(rawStatus: string): NormalizedLiveStatus {
  const text = String(rawStatus || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('transfer')) return 'transferring';
  if (text.includes('hold')) return 'on_hold';
  if (text.includes('ring')) return 'ringing';
  if (text.includes('dial') || text.includes('calling')) return 'dialing';
  if (text.includes('on a call') || text.includes('on call')) return 'on_call';
  // MightyCall profile status values: Busy = agent is on an active call
  if (text === 'busy' || text === 'incall' || text === 'in_call' || text === 'oncall') return 'on_call';
  if (text.includes('connect') || text.includes('talk') || text.includes('in progress') || text.includes('active call') || text.includes('in call')) return 'on_call';
  if (text.includes('busy')) return 'on_call';
  if (text.includes('wrap')) return 'wrap_up';
  if (text.includes('do not disturb') || text === 'dnd' || text.includes('disturb')) return 'dnd';
  if (text.includes('offline')) return 'offline';
  // MightyCall "Free" = agent is available (not on a call)
  if (text === 'free' || text.includes('free')) return 'available';
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
    )) || null;
  }
  return typeof data === 'object' ? data : null;
}

async function fetchOfficialProfileStatusByExtension(
  extension: string,
  accessToken: string,
  apiKeyOverride?: string
): Promise<any | null> {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': apiKeyOverride || MIGHTYCALL_API_KEY || '',
  };
  const attempts: Array<{ label: string; url: string }> = [];
  for (const paramName of ['extension', 'ext', 'extensionNumber']) {
    const params = new URLSearchParams({ [paramName]: extension });
    attempts.push({ label: `/profile/status?${paramName}`, url: `${base}/profile/status?${params.toString()}` });
  }
  for (const path of [
    `/profile/status/${encodeURIComponent(extension)}`,
    `/profile/${encodeURIComponent(extension)}/status`,
    `/profiles/${encodeURIComponent(extension)}/status`,
    `/users/${encodeURIComponent(extension)}/status`,
    `/user/${encodeURIComponent(extension)}/status`,
    `/extensions/${encodeURIComponent(extension)}/status`,
  ]) {
    attempts.push({ label: path, url: `${base}${path}` });
  }

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    let res: any;
    try {
      res = await fetch(attempt.url, {
        method: 'GET',
        headers,
        signal: controller.signal as any,
      });
    } catch {
      clearTimeout(timeoutId);
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res?.ok) continue;
    const body = await res.json().catch(() => null);
    const payload = pickProfileStatusPayload(body, extension);
    if (payload) return { ...payload, sourceEndpoint: attempt.label };
  }
  return null;
}

function deriveDirection(value: any): 'inbound' | 'outbound' | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  return null;
}

function liveCallHasConnectedPeer(call: any): boolean {
  if (!call || typeof call !== 'object') return false;
  const called = Array.isArray(call?.called) ? call.called : [];
  if (called.some((p: any) => p && (p.isConnected === true || p.connected === true))) return true;
  if (call?.callee && (call.callee.isConnected === true || call.callee.connected === true)) return true;
  if (call?.destination && (call.destination.isConnected === true || call.destination.connected === true)) return true;
  if (call?.client && (call.client.isConnected === true || call.client.connected === true)) return true;
  if (call?.caller && (call.caller.isConnected === true || call.caller.connected === true)) return true;
  return false;
}

function extractStatusText(payload: any): string {
  return firstText(
    payload?.status?.name,
    payload?.status?.label,
    payload?.status?.status,
    payload?.status?.value,
    payload?.callStatus,
    payload?.call_status,
    payload?.status,
    payload?.state,
    payload?.wfstate?.state,
    payload?.wfstate?.name,
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

function parseDurationSeconds(value: any): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  // MightyCall call evidence often returns duration as milliseconds while some
  // report endpoints use seconds. Treat large numeric values as milliseconds so
  // completed calls expire quickly instead of staying "on call" for hours.
  if (num > 6 * 60 * 60) return Math.floor(num / 1000);
  return Math.floor(num);
}

function normalizeDigits(value: any): string {
  return String(value || '').replace(/\D/g, '');
}

function collectBusinessLineDigits(...payloads: any[]): Set<string> {
  const out = new Set<string>();
  for (const payload of payloads) {
    const candidates = [
      payload?.businessNumber,
      payload?.business_number,
      payload?.caller?.phone,
      payload?.caller?.number,
      payload?.caller?.address,
      payload?.from_number,
      payload?.from,
    ];
    for (const value of candidates) {
      const digits = normalizeDigits(value);
      if (digits.length >= 7) out.add(digits);
    }
  }
  return out;
}

function firstCounterpartCandidate(
  candidates: any[],
  extension: string,
  blockedDigits: Set<string>
): string | null {
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) continue;
    const digits = normalizeDigits(text);
    if (!digits) continue;
    if (digits === extension) continue;
    if (blockedDigits.has(digits)) continue;
    if (digits.length >= 7) return text;
  }
  return null;
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

function collectExtensionCandidates(payload: any): string[] {
  const out = new Set<string>();
  const queue: any[] = [payload];
  const seen = new Set<any>();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || typeof next !== 'object' || seen.has(next)) continue;
    seen.add(next);
    for (const [key, value] of Object.entries(next)) {
      const keyNorm = String(key || '').toLowerCase();
      if (
        keyNorm.includes('extension') ||
        keyNorm === 'ext' ||
        keyNorm.includes('agent_extension') ||
        keyNorm.includes('operator_extension')
      ) {
        const ext = normalizeExtension(value);
        if (ext) out.add(ext);
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return Array.from(out);
}

function normalizeDirection(value: any): 'inbound' | 'outbound' | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  return null;
}

function callRowId(row: any): string {
  return String(
    row?.id ||
    row?.callId ||
    row?.requestGuid ||
    row?.external_id ||
    ''
  ).trim();
}

function extractLikelyPhoneCandidates(payload: any): string[] {
  const out = new Set<string>();
  const queue: any[] = [payload];
  const seen = new Set<any>();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || typeof next !== 'object' || seen.has(next)) continue;
    seen.add(next);
    for (const [key, value] of Object.entries(next)) {
      const keyNorm = String(key || '').toLowerCase();
      const looksLikePhoneField = (
        keyNorm.includes('phone') ||
        keyNorm.includes('number') ||
        keyNorm.includes('address') ||
        keyNorm.includes('caller') ||
        keyNorm.includes('callee') ||
        keyNorm.includes('destination') ||
        keyNorm === 'from' ||
        keyNorm === 'to'
      );
      if (looksLikePhoneField && (typeof value === 'string' || typeof value === 'number')) {
        const text = String(value).trim();
        if (text) out.add(text);
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return Array.from(out);
}

function pickCounterpartFromPayload(payload: any, extension: string): string | null {
  const candidates = extractLikelyPhoneCandidates(payload);
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (!digits) continue;
    if (digits === extension) continue;
    if (digits.length >= 7) return candidate;
  }
  return null;
}

function pickDirectionalCounterpart(
  direction: 'inbound' | 'outbound' | null,
  currentCall: any,
  profile: any,
  activeCallEvidence: any,
  extension: string
): string | null {
  const blockedBusinessDigits = collectBusinessLineDigits(currentCall, profile, activeCallEvidence);
  if (direction === 'outbound') {
    const strictCandidate = firstCounterpartCandidate([
      currentCall?.called?.[0]?.phone,
      currentCall?.called?.[0]?.number,
      currentCall?.called?.phone,
      currentCall?.called?.number,
      currentCall?.callee?.phone,
      currentCall?.callee?.number,
      currentCall?.destination?.number,
      currentCall?.destination?.phone,
      currentCall?.to_number,
      currentCall?.to,
      currentCall?.toNumber,
      currentCall?.called_number,
      currentCall?.calledNumber,
      profile?.called?.[0]?.phone,
      profile?.called?.[0]?.number,
      profile?.destination?.number,
      profile?.to_number,
      profile?.to,
      profile?.toNumber,
      activeCallEvidence?.called?.[0]?.phone,
      activeCallEvidence?.called?.[0]?.number,
      activeCallEvidence?.called?.phone,
      activeCallEvidence?.called?.number,
      activeCallEvidence?.destination?.number,
      activeCallEvidence?.to_number,
      activeCallEvidence?.to,
      activeCallEvidence?.toNumber
    ], extension, blockedBusinessDigits);
    if (strictCandidate) return strictCandidate;
    return pickCounterpartFromPayload(currentCall, extension) || pickCounterpartFromPayload(activeCallEvidence, extension);
  }

  if (direction === 'inbound') {
    const strictCandidate = firstCounterpartCandidate([
      currentCall?.from_number,
      currentCall?.from,
      currentCall?.caller?.number,
      currentCall?.client?.number,
      currentCall?.client?.address,
      profile?.from_number,
      profile?.from,
      profile?.caller?.number,
      profile?.client?.number,
      profile?.client?.address,
      activeCallEvidence?.from_number,
      activeCallEvidence?.from,
      activeCallEvidence?.caller?.number,
      activeCallEvidence?.client?.number,
      activeCallEvidence?.client?.address
    ], extension, blockedBusinessDigits);
    if (strictCandidate) return strictCandidate;
    return pickCounterpartFromPayload(currentCall, extension) || pickCounterpartFromPayload(activeCallEvidence, extension);
  }

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
      const deepExts = collectExtensionCandidates(row);
      if (rowExt && rowExt === normalizedExt) return true;
      if (deepExts.length > 0) return deepExts.includes(normalizedExt);
      return !rowExt;
    })
    .filter((row) => {
      const status = String(row?.status || row?.state || row?.callStatus || '').trim();
      const endedAt = row?.ended_at || row?.endedAt || null;
      if (endedAt) return false;
      if (isTerminalCallStatusText(status)) return false;
      const hasActiveStatus = isActiveCallStatusText(status);
      const hasConnectedFlag = Boolean(
        row?.isConnected === true ||
        row?.connected === true ||
        row?.is_connected === true ||
        row?.onCall === true ||
        row?.inCall === true ||
        liveCallHasConnectedPeer(row)
      );
      const startedMs = parseMs(
        row?.started_at ||
        row?.startedAt ||
        row?.dateTimeUtc ||
        row?.datetimeUtc ||
        row?.createdAt ||
        row?.created_at ||
        row?.updatedAt ||
        row?.updated_at
      );
      const durationSeconds = parseDurationSeconds(
        row?.duration_seconds ??
        row?.durationSeconds ??
        row?.duration
      );
      if (startedMs != null && durationSeconds != null) {
        const endedByDurationMs = startedMs + (durationSeconds * 1000);
        if (endedByDurationMs < (now - 15_000)) return false;
      }
      if (!startedMs) return hasActiveStatus || hasConnectedFlag;
      const ageMs = now - startedMs;
      if (!(ageMs >= 0 && ageMs <= (5 * 60 * 1000))) return false;
      return hasActiveStatus || hasConnectedFlag;
    });

  if (normalizedRows.length === 0) return null;
  normalizedRows.sort((a, b) => (
    parseMs(
      b?.started_at ||
      b?.startedAt ||
      b?.dateTimeUtc ||
      b?.datetimeUtc ||
      b?.createdAt ||
      b?.created_at ||
      b?.updatedAt ||
      b?.updated_at
    ) || 0
  ) - (
    parseMs(
      a?.started_at ||
      a?.startedAt ||
      a?.dateTimeUtc ||
      a?.datetimeUtc ||
      a?.createdAt ||
      a?.created_at ||
      a?.updatedAt ||
      a?.updated_at
    ) || 0
  ));
  return normalizedRows[0];
}

export async function getMightyCallStatusByExtension(input: {
  extension: string;
  orgId?: string | null;
}): Promise<MightyCallStatusByExtension> {
  const extension = normalizeExtension(input.extension);
  if (!extension) throw new Error('extension is required');

  let overrideCreds: { clientId?: string; clientSecret?: string; baseUrl?: string } | undefined;
  if (input.orgId) {
    const integ = await getOrgIntegration(input.orgId, 'mightycall').catch(() => null);
    if (integ?.credentials) {
      overrideCreds = {
        clientId: integ.credentials.clientId || integ.credentials.apiKey || undefined,
        clientSecret: integ.credentials.clientSecret || integ.credentials.userKey || undefined,
        baseUrl: integ.credentials.baseUrl || integ.credentials.apiBaseUrl || undefined,
      };
    }
  }
  const token = await getMightyCallAccessToken(overrideCreds);
  const apiKeyOverride = overrideCreds?.clientId || undefined;

  const callsWindowStart = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
  const callsWindowEnd = new Date(Date.now() + (5 * 60 * 1000)).toISOString();

  // Fetch status sources in parallel to keep within request deadline budget.
  const [officialProfile, fallbackProfile, liveCall, recentCalls, recentCallsBroad, recentComms] = await Promise.all([
    withTimeout(
      fetchOfficialProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      1800,
      null
    ),
    withTimeout(
      fetchMightyCallProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      1800,
      null
    ),
    withTimeout(
      fetchMightyCallLiveCallByExtension(extension, token, apiKeyOverride).catch(() => null),
      1800,
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
      1800,
      [] as any[]
    ),
    withTimeout(
      fetchMightyCallCalls(token, {
        startUtc: callsWindowStart,
        endUtc: callsWindowEnd,
        pageSize: '50',
        maxPages: '1',
        fast: true,
        returnOnFirstSuccess: true,
      }, apiKeyOverride).catch(() => []),
      1800,
      [] as any[]
    ),
    withTimeout(
      fetchMightyCallContactCenterCommunications(token, {
        from: new Date(Date.now() - (45 * 1000)).toISOString(),
        to: new Date(Date.now() + (60 * 1000)).toISOString(),
        type: 'Call',
        pageSize: '50',
        page: '1',
        showUsers: 'true',
        resolveContacts: 'false',
      }, apiKeyOverride).catch(() => []),
      1800,
      [] as any[]
    ),
  ]);
  const profile = officialProfile || fallbackProfile;

  // --- PROFILE-FIRST FAST PATH ---
  // If the profile status endpoint returns a definitive answer (Available/Busy/DND/Offline),
  // trust it immediately without waiting for call-record evidence.
  // MightyCall profile status is real-time; call records only appear after calls complete.
  if (profile && !liveCall?.currentCall) {
    const profileRaw = String(
      profile?.status?.name || profile?.status?.label || profile?.status?.value ||
      profile?.status || profile?.availability || profile?.presenceStatus || ''
    ).trim();
    const profileNorm = normalizeFromRawStatus(profileRaw);
    if (profileNorm === 'available' || profileNorm === 'dnd' || profileNorm === 'offline') {
      // Definitive idle — return immediately, don't let stale call records override
      const now = new Date().toISOString();
      return {
        extension,
        rawStatus: profileRaw,
        normalizedStatus: profileNorm,
        source: 'mightycall_user_status_by_extension',
        lastSyncedAt: now,
        raw: profile,
        decisionReason: 'profile_definitive_idle',
        resolverVersion: LIVE_STATUS_RESOLVER_VERSION,
        mightycallUserId: profile?.userId || profile?.user_id || profile?.id || undefined,
        email: profile?.email || undefined,
        name: profile?.name || profile?.displayName || profile?.display_name || undefined,
      };
    }
    if (profileNorm === 'on_call' || profileNorm === 'ringing' || profileNorm === 'dialing') {
      // Definitive active — return on_call immediately
      const now = new Date().toISOString();
      return {
        extension,
        rawStatus: profileRaw,
        normalizedStatus: profileNorm,
        source: 'mightycall_user_status_by_extension',
        lastSyncedAt: now,
        raw: profile,
        decisionReason: 'profile_definitive_active',
        resolverVersion: LIVE_STATUS_RESOLVER_VERSION,
        mightycallUserId: profile?.userId || profile?.user_id || profile?.id || undefined,
        email: profile?.email || undefined,
        name: profile?.name || profile?.displayName || profile?.display_name || undefined,
        statusStartedAt: profile?.statusStartedAt || profile?.status_started_at || undefined,
      };
    }
  }
  // --- END PROFILE-FIRST FAST PATH ---

  const currentCall = firstObject(
    liveCall?.currentCall,
    profile?.currentCall,
    profile?.current_call,
    profile?.call,
    profile?.activeCall,
    profile?.active_call,
    profile?.status?.currentCall,
    profile?.status?.current_call
  );
  const profileCurrentCallId = firstText(
    currentCall?.id,
    currentCall?.callId,
    profile?.currentCallId,
    profile?.current_call_id,
    profile?.activeCallId,
    profile?.active_call_id,
    profile?.callId
  ) || null;
  const callsRows = Array.isArray(recentCalls) ? recentCalls : [];
  const broadRows = Array.isArray(recentCallsBroad) ? recentCallsBroad : [];
  const commRows = Array.isArray(recentComms) ? recentComms : [];
  const callByProfileId = profileCurrentCallId
    ? callsRows.find((row: any) => (
        String(row?.id || row?.callId || row?.requestGuid || '').trim() === profileCurrentCallId
      )) || null
    : null;
  const activeCallEvidence =
    callByProfileId ||
    pickActiveCallEvidence(commRows as any[], extension) ||
    pickActiveCallEvidence(callsRows as any[], extension) ||
    pickActiveCallEvidence(broadRows as any[], extension);

  let rawStatus = extractStatusText(profile) || extractStatusText(currentCall) || 'Unknown';
  let normalizedStatus = normalizeFromRawStatus(rawStatus);
  const profileLooksIdle =
    normalizedStatus === 'available' ||
    normalizedStatus === 'wrap_up' ||
    normalizedStatus === 'dnd' ||
    normalizedStatus === 'offline';

  const onCallBoolean = payloadHasOnCallBoolean(profile) || payloadHasOnCallBoolean(currentCall);
  if (onCallBoolean && (normalizedStatus === 'available' || normalizedStatus === 'unknown')) {
    normalizedStatus = 'on_call';
  }

  if (liveCall?.onCall && currentCall) {
    const callStatusText = extractStatusText(currentCall);
    const byCall = normalizeFromRawStatus(callStatusText);
    const callDirection = deriveDirection(
      currentCall?.direction ||
      currentCall?.callDirection ||
      profile?.direction ||
      activeCallEvidence?.direction ||
      activeCallEvidence?.callDirection
    );
    const peerConnected = liveCallHasConnectedPeer(currentCall);
    const currentCallStartedMs = parseMs(
      currentCall?.startedAt ||
      currentCall?.started_at ||
      currentCall?.dateTimeUtc
    );
    const currentCallAgeMs = currentCallStartedMs != null ? (Date.now() - currentCallStartedMs) : null;
    const currentCallFresh = currentCallAgeMs != null && currentCallAgeMs >= 0 && currentCallAgeMs <= 180_000;
    if (!peerConnected) {
      normalizedStatus = callDirection === 'outbound' ? 'dialing' : 'ringing';
    } else if (byCall === 'ringing' || byCall === 'dialing') normalizedStatus = byCall;
    else if (byCall === 'on_call') normalizedStatus = 'on_call';
    else if (onCallBoolean || currentCallFresh) normalizedStatus = 'on_call';
    if (normalizedStatus === 'on_call' && normalizeFromRawStatus(rawStatus) === 'available' && callStatusText) {
      rawStatus = callStatusText;
    }
  }

  const activeEvidenceStatusText = String(
    activeCallEvidence?.status ||
    activeCallEvidence?.state ||
    activeCallEvidence?.callStatus ||
    ''
  );
  const activeEvidenceNorm = normalizeFromRawStatus(activeEvidenceStatusText);
  const activeEvidenceHasConnectedFlag = Boolean(
    activeCallEvidence?.isConnected === true ||
    activeCallEvidence?.connected === true ||
    activeCallEvidence?.is_connected === true ||
    activeCallEvidence?.onCall === true ||
    activeCallEvidence?.inCall === true ||
    liveCallHasConnectedPeer(activeCallEvidence)
  );
  const activeEvidenceStartedMs = parseMs(
    activeCallEvidence?.started_at ||
    activeCallEvidence?.startedAt ||
    activeCallEvidence?.dateTimeUtc ||
    activeCallEvidence?.datetimeUtc ||
    activeCallEvidence?.createdAt ||
    activeCallEvidence?.created_at ||
    activeCallEvidence?.updatedAt ||
    activeCallEvidence?.updated_at
  );
  const activeEvidenceDurationSeconds = parseDurationSeconds(
    activeCallEvidence?.duration_seconds ??
    activeCallEvidence?.durationSeconds ??
    activeCallEvidence?.duration
  );
  const activeEvidenceExpiredByDuration = Boolean(
    activeEvidenceStartedMs != null &&
    activeEvidenceDurationSeconds != null &&
    (activeEvidenceStartedMs + (activeEvidenceDurationSeconds * 1000)) < (Date.now() - 15_000)
  );
  const activeEvidenceAgeMs = activeEvidenceStartedMs != null ? (Date.now() - activeEvidenceStartedMs) : null;
  const activeEvidenceId = callRowId(activeCallEvidence);
  const profileCallId = String(profileCurrentCallId || '').trim();
  const activeEvidenceMatchesProfileId =
    !profileCallId ||
    !activeEvidenceId ||
    activeEvidenceId === profileCallId;
  const activeEvidenceFresh = activeEvidenceAgeMs != null && activeEvidenceAgeMs >= 0 && activeEvidenceAgeMs <= LIVE_EVIDENCE_FRESH_MS;
  const activeEvidenceStrong =
    activeEvidenceHasConnectedFlag ||
    activeEvidenceNorm === 'ringing' ||
    activeEvidenceNorm === 'dialing' ||
    activeEvidenceNorm === 'on_call';
  const profileIdleNorm = normalizeFromRawStatus(rawStatus);
  const profileActiveSignal = Boolean(
    profile &&
    (
      profileIdleNorm === 'ringing' ||
      profileIdleNorm === 'dialing' ||
      profileIdleNorm === 'on_call'
    )
  );
  const hasDirectLiveCallObject = Boolean(
    currentCall ||
    liveCall?.currentCall ||
    profile?.currentCall ||
    profile?.current_call
  );
  const directCallStartedMs = parseMs(
    currentCall?.startedAt ||
    currentCall?.started_at ||
    currentCall?.dateTimeUtc ||
    currentCall?.datetimeUtc ||
    currentCall?.updatedAt ||
    currentCall?.updated_at
  );
  const directCallDurationSeconds = parseDurationSeconds(
    currentCall?.duration_seconds ??
    currentCall?.durationSeconds ??
    currentCall?.duration
  );
  const directCallId = callRowId(currentCall) || callRowId(activeCallEvidence) || profileCurrentCallId || null;
  const durationProgress = trackDurationProgress(directCallId, directCallDurationSeconds, Date.now());
  const directCallExpiredByDuration = Boolean(
    directCallStartedMs != null &&
    directCallDurationSeconds != null &&
    (directCallStartedMs + (directCallDurationSeconds * 1000)) < (Date.now() - 15_000)
  );
  const directCallAgeMs = directCallStartedMs != null ? (Date.now() - directCallStartedMs) : null;
  const hasFreshDirectLiveCallObject = Boolean(
    hasDirectLiveCallObject &&
    directCallAgeMs != null &&
    directCallAgeMs >= 0 &&
    directCallAgeMs <= LIVE_EVIDENCE_FRESH_MS &&
    !directCallExpiredByDuration
  );
  const profileExplicitIdle =
    profileIdleNorm === 'available' ||
    profileIdleNorm === 'dnd' ||
    profileIdleNorm === 'offline' ||
    profileIdleNorm === 'wrap_up';
  const strategyStats = Array.isArray(liveCall?.debug?.strategyStats) ? liveCall.debug.strategyStats : [];
  const strictConnectedOpenRows = Number(
    strategyStats.find((entry: any) => {
      const label = String(entry?.label || '');
      return label === 'strict_connected_open' || label.includes('callFilter=Connected&customFilter=Open');
    })?.rows ?? -1
  );
  const relaxedHistoryOnlyLiveSignal = Boolean(
    String(liveCall?.sourceEndpoint || '').includes('multi_strategy_live_probe') &&
    strictConnectedOpenRows === 0
  );
  const currentCallStatusNorm = normalizeFromRawStatus(extractStatusText(currentCall));
  const directCurrentCallLooksActive = Boolean(
    currentCall &&
    !directCallExpiredByDuration &&
    (
      liveCall?.onCall === true ||
      onCallBoolean ||
      currentCallStatusNorm === 'ringing' ||
      currentCallStatusNorm === 'dialing' ||
      currentCallStatusNorm === 'on_call' ||
      liveCallHasConnectedPeer(currentCall)
    )
  );
  const directLiveSignalTrusted = Boolean(
    directCurrentCallLooksActive ||
    (
      !(
        profileExplicitIdle &&
        relaxedHistoryOnlyLiveSignal
      ) && (
        !profileExplicitIdle ||
        durationProgress.hasRecentProgress ||
        Boolean(directCallAgeMs != null && directCallAgeMs >= 0 && directCallAgeMs <= 20_000)
      )
    )
  );
  const activeEvidenceAllowed = Boolean(
    activeCallEvidence &&
    activeEvidenceStrong &&
    !activeEvidenceExpiredByDuration &&
    activeEvidenceFresh &&
    activeEvidenceMatchesProfileId
  );
  const activeConnectedEvidenceAllowed = Boolean(
    activeCallEvidence &&
    activeEvidenceMatchesProfileId &&
    !activeEvidenceExpiredByDuration &&
    activeEvidenceHasConnectedFlag &&
    (
      activeEvidenceNorm === 'on_call' ||
      activeEvidenceNorm === 'ringing' ||
      activeEvidenceNorm === 'dialing' ||
      isActiveCallStatusText(activeEvidenceStatusText)
    )
  );

  let decisionReason = 'profile_status_default';

  // Strongest signal: we have an active call evidence with connected flag or active status
  if (activeEvidenceAllowed || activeConnectedEvidenceAllowed) {
    if (activeEvidenceNorm === 'ringing' || activeEvidenceNorm === 'dialing' || activeEvidenceNorm === 'on_call') {
      normalizedStatus = activeEvidenceNorm;
      decisionReason = activeEvidenceAllowed ? 'fresh_active_evidence_status' : 'connected_active_evidence_status';
    } else if (activeEvidenceHasConnectedFlag) {
      normalizedStatus = 'on_call';
      decisionReason = activeEvidenceAllowed ? 'fresh_active_evidence_connected_flag' : 'connected_active_evidence_flag';
    }
  }

  // Next: direct live call object from /calls endpoint
  if ((hasFreshDirectLiveCallObject || directCurrentCallLooksActive) && directLiveSignalTrusted) {
    if (normalizedStatus === 'ringing' || normalizedStatus === 'dialing' || normalizedStatus === 'on_call') {
      decisionReason = 'direct_live_call_status';
    } else if (currentCallStatusNorm === 'ringing' || currentCallStatusNorm === 'dialing' || currentCallStatusNorm === 'on_call') {
      normalizedStatus = currentCallStatusNorm;
      decisionReason = 'direct_current_call_status';
    } else if (onCallBoolean || (liveCall?.onCall && directLiveSignalTrusted)) {
      normalizedStatus = 'on_call';
      decisionReason = 'direct_live_call_boolean';
    }
    // Do NOT fall back to profile idle here — the direct live call object is strong evidence
  }

  // Only fall back to profile status if we have NO live call evidence at all
  if (!hasDirectLiveCallObject && !activeCallEvidence && !onCallBoolean && !liveCall?.onCall) {
    if (profileExplicitIdle) {
      normalizedStatus = profileIdleNorm;
      decisionReason = 'profile_idle_without_direct_live_call';
    } else if (profileActiveSignal) {
      normalizedStatus = profileIdleNorm;
      decisionReason = 'profile_active_status';
    } else {
      normalizedStatus = profileIdleNorm;
      decisionReason = 'profile_fallback_without_fresh_evidence';
    }
  }

  // Safety valve: if profile explicitly says idle AND we have no strong active signal,
  // allow profile to override — but only if there's no connected peer
  if (profileExplicitIdle && relaxedHistoryOnlyLiveSignal && !activeEvidenceHasConnectedFlag && !liveCallHasConnectedPeer(currentCall)) {
    normalizedStatus = profileIdleNorm;
    decisionReason = 'profile_idle_overrides_relaxed_history_probe';
  }

  const hasStrongActiveSignal = Boolean(
    onCallBoolean ||
    profileActiveSignal ||
    (liveCall?.onCall && directLiveSignalTrusted) ||
    activeEvidenceAllowed ||
    activeConnectedEvidenceAllowed
  );

  const effectiveDirection = deriveDirection(
    currentCall?.direction ||
    currentCall?.callDirection ||
    profile?.direction ||
    activeCallEvidence?.direction ||
    activeCallEvidence?.callDirection
  ) || normalizeDirection(activeCallEvidence?.direction || activeCallEvidence?.callDirection);

  const directionalCounterpart = pickDirectionalCounterpart(
    effectiveDirection,
    currentCall,
    profile,
    activeCallEvidence,
    extension
  );

  const effectiveCounterpart = directionalCounterpart || firstText(
    currentCall?.from_number,
    currentCall?.from,
    currentCall?.caller?.number,
    currentCall?.to_number,
    currentCall?.to,
    currentCall?.called?.number,
    currentCall?.client?.address,
    currentCall?.client?.number,
    currentCall?.counterpart,
    currentCall?.counterpartNumber,
    currentCall?.counterpart_number,
    currentCall?.destination?.number,
    currentCall?.destination?.phone,
    currentCall?.destinationNumber,
    currentCall?.destination_number,
    currentCall?.callee,
    currentCall?.calleeNumber,
    currentCall?.callee_number,
    currentCall?.called_number,
    currentCall?.calledNumber,
    currentCall?.toNumber,
    currentCall?.fromNumber,
    profile?.counterpart,
    profile?.counterpartNumber,
    profile?.counterpart_number,
    profile?.from_number,
    profile?.from,
    profile?.to_number,
    profile?.to,
    profile?.phone,
    profile?.client?.address,
    profile?.client?.number,
    profile?.destination?.number,
    profile?.destinationNumber,
    profile?.destination_number,
    profile?.called_number,
    profile?.calledNumber,
    profile?.toNumber,
    profile?.fromNumber,
    activeCallEvidence?.from_number,
    activeCallEvidence?.from,
    activeCallEvidence?.to_number,
    activeCallEvidence?.to,
    activeCallEvidence?.client?.address,
    activeCallEvidence?.client?.number,
    activeCallEvidence?.destination?.number,
    activeCallEvidence?.destinationNumber,
    activeCallEvidence?.destination_number,
    activeCallEvidence?.called_number,
    activeCallEvidence?.calledNumber,
    activeCallEvidence?.toNumber,
    activeCallEvidence?.fromNumber,
    activeCallEvidence?.phone,
    activeCallEvidence?.counterpart,
    pickCounterpartFromPayload(currentCall, extension),
    pickCounterpartFromPayload(profile, extension),
    pickCounterpartFromPayload(activeCallEvidence, extension)
  ) || null;

  const effectiveCurrentCallId = String(
    currentCall?.id ||
    currentCall?.callId ||
    profileCurrentCallId ||
    activeCallEvidence?.id ||
    activeCallEvidence?.callId ||
    ''
  ).trim() || null;

  const hasConcreteLiveContext = Boolean(
    currentCall ||
    profileActiveSignal ||
    effectiveCurrentCallId ||
    effectiveCounterpart ||
    activeCallEvidence?.id ||
    activeCallEvidence?.callId ||
    activeCallEvidence?.requestGuid
  );
  const canSafelyKeepOnCall = hasStrongActiveSignal && hasConcreteLiveContext;
  if (normalizedStatus === 'on_call' && !canSafelyKeepOnCall) {
    normalizedStatus = 'available';
    decisionReason = 'safety_clear_no_live_context';
  }

  const shouldClearWeakUnknownCallContext =
    (normalizedStatus === 'unknown' && !hasStrongActiveSignal) ||
    (normalizedStatus === 'available' && !hasConcreteLiveContext);

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
    statusStartedAt: shouldClearWeakUnknownCallContext ? undefined : firstIso(
      currentCall?.startedAt,
      currentCall?.started_at,
      currentCall?.dateTimeUtc,
      profile?.statusStartedAt,
      profile?.status_started_at,
      profile?.currentCallStartedAt,
      profile?.current_call_started_at,
      profile?.callStartedAt,
      profile?.call_started_at,
      activeCallEvidence?.started_at,
      activeCallEvidence?.startedAt,
      activeCallEvidence?.dateTimeUtc,
      profile?.statusStartedAt,
      profile?.status_started_at,
      profile?.updatedAt,
      profile?.updated_at
    ),
    lastSyncedAt: new Date().toISOString(),
    raw: {
      resolverVersion: LIVE_STATUS_RESOLVER_VERSION,
      decisionReason,
      profileStatusNorm: profileIdleNorm,
      hasDirectLiveCallObject,
      activeEvidenceFresh,
      activeEvidenceMatched: activeEvidenceMatchesProfileId,
      activeEvidenceExpiredByDuration,
      activeEvidenceAgeMs,
      strictConnectedOpenRows,
      relaxedHistoryOnlyLiveSignal,
      directLiveSignalTrusted,
      directCurrentCallLooksActive,
      durationProgress,
      profileStatus: profile || null,
      liveCall: liveCall || null,
      activeCallEvidence: activeCallEvidence || null,
    },
    source: 'mightycall_user_status_by_extension',
    direction: shouldClearWeakUnknownCallContext ? null : effectiveDirection,
    counterpartNumber: shouldClearWeakUnknownCallContext ? null : effectiveCounterpart,
    currentCallId: shouldClearWeakUnknownCallContext ? null : effectiveCurrentCallId,
    decisionReason,
    evidenceAgeMs: activeEvidenceAgeMs,
    resolverVersion: LIVE_STATUS_RESOLVER_VERSION,
    profileStatusNorm: profileIdleNorm,
    hasDirectLiveCallObject,
    activeEvidenceFresh,
    activeEvidenceMatched: activeEvidenceMatchesProfileId,
    activeEvidenceExpiredByDuration,
  };
}
