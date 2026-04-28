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

function parseDurationSeconds(value: any): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
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
  if (direction === 'outbound') {
    return firstText(
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
    ) || pickCounterpartFromPayload(currentCall, extension) || pickCounterpartFromPayload(activeCallEvidence, extension);
  }

  if (direction === 'inbound') {
    return firstText(
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
    ) || pickCounterpartFromPayload(currentCall, extension) || pickCounterpartFromPayload(activeCallEvidence, extension);
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
        row?.inCall === true
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
      if (!(ageMs >= 0 && ageMs <= (20 * 60 * 1000))) return false;
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
  const [officialProfile, fallbackProfile, liveCall, recentCalls, recentCallsBroad] = await Promise.all([
    withTimeout(
      fetchOfficialProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      4200,
      null
    ),
    withTimeout(
      fetchMightyCallProfileStatusByExtension(extension, token, apiKeyOverride).catch(() => null),
      4200,
      null
    ),
    withTimeout(
      fetchMightyCallLiveCallByExtension(extension, token, apiKeyOverride).catch(() => null),
      4200,
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
      4200,
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
      4200,
      [] as any[]
    ),
  ]);
  const profile = officialProfile || fallbackProfile;
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
  const callByProfileId = profileCurrentCallId
    ? callsRows.find((row: any) => (
        String(row?.id || row?.callId || row?.requestGuid || '').trim() === profileCurrentCallId
      )) || null
    : null;
  const activeCallEvidence =
    callByProfileId ||
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
    const currentCallStartedMs = parseMs(
      currentCall?.startedAt ||
      currentCall?.started_at ||
      currentCall?.dateTimeUtc
    );
    const currentCallFresh = currentCallStartedMs != null && (Date.now() - currentCallStartedMs) <= 180_000;
    if (byCall === 'ringing' || byCall === 'dialing') normalizedStatus = byCall;
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
    activeCallEvidence?.inCall === true
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
  const activeEvidenceId = callRowId(activeCallEvidence);
  const profileCallId = String(profileCurrentCallId || '').trim();
  const activeEvidenceMatchesProfileId =
    !profileCallId ||
    !activeEvidenceId ||
    activeEvidenceId === profileCallId;
  const activeEvidenceFreshForUnknownFallback =
    activeEvidenceStartedMs != null &&
    (Date.now() - activeEvidenceStartedMs) <= 180_000;
  const activeEvidenceFresh =
    activeEvidenceStartedMs != null &&
    (Date.now() - activeEvidenceStartedMs) <= (20 * 60 * 1000);
  const activeEvidenceVeryFresh =
    activeEvidenceStartedMs != null &&
    (Date.now() - activeEvidenceStartedMs) <= 45_000;
  const activeEvidenceStrong =
    activeEvidenceHasConnectedFlag ||
    activeEvidenceNorm === 'ringing' ||
    activeEvidenceNorm === 'dialing' ||
    activeEvidenceNorm === 'on_call';
  const canUseEvidenceToForceActive =
    !profileLooksIdle ||
    !!currentCall ||
    onCallBoolean ||
    (activeEvidenceStrong && activeEvidenceFresh) ||
    (normalizedStatus === 'unknown' && activeEvidenceFreshForUnknownFallback);
  if (
    activeCallEvidence &&
    activeEvidenceMatchesProfileId &&
    canUseEvidenceToForceActive &&
    (normalizedStatus === 'available' || normalizedStatus === 'unknown')
  ) {
    if (activeEvidenceNorm === 'ringing' || activeEvidenceNorm === 'dialing' || activeEvidenceNorm === 'on_call') {
      normalizedStatus = activeEvidenceNorm;
    } else if (activeEvidenceHasConnectedFlag) {
      normalizedStatus = 'on_call';
    }
  }

  // Hard guard against ghost "on call":
  // if profile clearly says idle and we do not have a very-fresh active signal,
  // do not keep on_call latched from older evidence.
  const profileIdleNorm = normalizeFromRawStatus(rawStatus);
  const profileExplicitIdle =
    profileIdleNorm === 'available' ||
    profileIdleNorm === 'dnd' ||
    profileIdleNorm === 'offline' ||
    profileIdleNorm === 'wrap_up';
  const hasAuthoritativeLiveActiveSignal =
    onCallBoolean ||
    !!liveCall?.onCall ||
    (activeEvidenceStrong && activeEvidenceVeryFresh && activeEvidenceMatchesProfileId);
  if (profileExplicitIdle && !hasAuthoritativeLiveActiveSignal) {
    normalizedStatus = profileIdleNorm;
  }

  // Final hard-stop for sticky ghost calls:
  // if upstream status is explicitly available and there is no direct live call object,
  // never keep on_call from historical inference.
  const profileExplicitAvailable = profileIdleNorm === 'available';
  const hasDirectLiveCallObject = Boolean(
    currentCall ||
    liveCall?.currentCall ||
    profile?.currentCall ||
    profile?.current_call
  );
  if (profileExplicitAvailable && !hasDirectLiveCallObject && !onCallBoolean && !liveCall?.onCall) {
    normalizedStatus = 'available';
  }

  const hasStrongActiveSignal = Boolean(
    onCallBoolean ||
    liveCall?.onCall ||
    activeEvidenceHasConnectedFlag ||
    activeEvidenceNorm === 'ringing' ||
    activeEvidenceNorm === 'dialing' ||
    activeEvidenceNorm === 'on_call'
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
    effectiveCurrentCallId ||
    effectiveCounterpart ||
    activeCallEvidence?.id ||
    activeCallEvidence?.callId ||
    activeCallEvidence?.requestGuid
  );
  const canSafelyKeepOnCall = hasStrongActiveSignal && hasConcreteLiveContext;
  if (normalizedStatus === 'on_call' && !canSafelyKeepOnCall) {
    normalizedStatus = 'available';
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
      profileStatus: profile || null,
      liveCall: liveCall || null,
      activeCallEvidence: activeCallEvidence || null,
    },
    source: 'mightycall_user_status_by_extension',
    direction: shouldClearWeakUnknownCallContext ? null : effectiveDirection,
    counterpartNumber: shouldClearWeakUnknownCallContext ? null : effectiveCounterpart,
    currentCallId: shouldClearWeakUnknownCallContext ? null : effectiveCurrentCallId,
  };
}
