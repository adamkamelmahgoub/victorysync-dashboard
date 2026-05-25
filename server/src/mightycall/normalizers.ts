export type NormalizedDirection = 'inbound' | 'outbound' | 'unknown';

export function pickDeep(obj: any, keys: string[]) {
  for (const key of keys) {
    const parts = key.split('.');
    let value = obj;
    for (const part of parts) {
      if (value == null) break;
      value = value[part];
    }
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

export function normalizePhone(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? `${plus}${digits}` : null;
}

export function normalizePhoneDigits(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

export function detectDirectionFromNumbers(
  fromNumber: string | null,
  toNumber: string | null,
  assignedBusinessNumbers: string[]
): NormalizedDirection {
  const assigned = new Set(assignedBusinessNumbers.map(normalizePhone).filter((value): value is string => !!value));
  const assignedDigits = new Set(assignedBusinessNumbers.map(normalizePhoneDigits).filter((value): value is string => !!value));
  const from = normalizePhone(fromNumber);
  const to = normalizePhone(toNumber);
  const fromDigits = normalizePhoneDigits(fromNumber);
  const toDigits = normalizePhoneDigits(toNumber);
  if ((from && assigned.has(from)) || (fromDigits && assignedDigits.has(fromDigits))) return 'outbound';
  if ((to && assigned.has(to)) || (toDigits && assignedDigits.has(toDigits))) return 'inbound';
  return 'unknown';
}

export function findRecordingUrl(raw: any): string | null {
  const value = pickDeep(raw, [
    'recordingUrl',
    'recording_url',
    'RecordingUrl',
    'recordUrl',
    'RecordUrl',
    'callRecordingUrl',
    'audioUrl',
    'AudioUrl',
    'mediaUrl',
    'recording.url',
    'recording.mediaUrl',
    'recording.audioUrl',
    'callRecord.uri',
    'callRecord.link',
    'callRecord.downloadUrl',
    'callRecord.recordingUrl',
    'call_record.uri',
    'call_record.link',
    'call_record.downloadUrl',
    'callRecording.uri',
    'callRecording.link',
    'callRecording.downloadUrl',
    'recordings.0.url',
    'recordings.0.uri',
    'recordings.0.link',
    'recordings.0.downloadUrl',
    'recordings.0.mediaUrl',
    'recordings.0.audioUrl',
  ]);
  return value ? String(value) : null;
}

export function directionFromText(value: unknown): NormalizedDirection {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return 'unknown';
  if (text.includes('out') || text === 'sent' || text === 'api' || text === 'external') return 'outbound';
  if (text.includes('in') || text === 'received' || text === 'internal') return 'inbound';
  return 'unknown';
}

export function normalizeMightyCallStatus(rawStatus: string | null | undefined) {
  const value = String(rawStatus || '').toLowerCase();
  if (value.includes('transfer')) return 'transferring';
  if (value.includes('hold')) return 'on_hold';
  if (value.includes('ring')) return 'ringing';
  if (value.includes('dial')) return 'dialing';
  if (value.includes('call') || value.includes('busy') || value.includes('talk') || value.includes('connect')) return 'on_call';
  if (value.includes('available') || value.includes('idle') || value.includes('ready')) return 'available';
  if (value.includes('offline')) return 'offline';
  if (value.includes('away')) return 'away';
  if (value.includes('dnd') || value.includes('disturb')) return 'dnd';
  return 'unknown';
}

export function normalizeCallStatus(rawStatus: unknown): string {
  const value = String(rawStatus || '').toLowerCase();
  if (value.includes('answer')) return 'answered';
  if (value.includes('miss')) return 'missed';
  if (value.includes('abandon')) return 'abandoned';
  if (value.includes('voice')) return 'voicemail';
  if (value.includes('fail') || value.includes('busy') || value.includes('cancel')) return 'failed';
  if (value.includes('complete') || value.includes('end') || value.includes('hang')) return 'completed';
  if (value.includes('progress') || value.includes('connect') || value.includes('talk')) return 'answered';
  return value || 'unknown';
}

export function detectTransferFromCallDetail(raw: any) {
  let transferTarget = pickDeep(raw, [
    'transferTarget',
    'TransferTarget',
    'transferredTo',
    'TransferredTo',
    'transfer.to',
    'transfer.target',
    'legs.0.transferTarget',
    'legs.0.transferredTo',
    'callLegs.0.transferTarget',
    'callLegs.0.transferredTo',
    'history.0.transferTarget',
    'history.0.transferredTo',
    'events.0.transferTarget',
    'events.0.transferredTo',
  ]);
  let transferType = pickDeep(raw, ['transferType', 'TransferType', 'transfer.type', 'legs.0.transferType', 'callLegs.0.transferType']);
  let transferStatus = pickDeep(raw, ['transferStatus', 'TransferStatus', 'transfer.status', 'legs.0.transferStatus', 'callLegs.0.transferStatus']);
  if (!transferTarget && !transferType && !transferStatus) {
    const discovered = findTransferLike(raw);
    transferTarget = discovered.target;
    transferType = discovered.type;
    transferStatus = discovered.status;
  }
  if (!transferTarget && !transferType && !transferStatus) return null;
  return {
    transferTarget: transferTarget ? String(transferTarget) : null,
    transferType: transferType ? String(transferType) : 'unknown',
    transferStatus: transferStatus ? String(transferStatus) : 'unknown',
  };
}

function findTransferLike(raw: any): { target: string | null; type: string | null; status: string | null } {
  const out = { target: null as string | null, type: null as string | null, status: null as string | null };
  const seen = new Set<any>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (lower.includes('transfer')) {
        if (typeof child === 'string' || typeof child === 'number') {
          if (lower.includes('target') || lower.includes('to')) out.target ||= String(child);
          else if (lower.includes('type')) out.type ||= String(child);
          else if (lower.includes('status') || lower.includes('result')) out.status ||= String(child);
          else out.type ||= String(child);
        } else if (child && typeof child === 'object') {
          out.target ||= firstString((child as any).target, (child as any).to, (child as any).transferredTo, (child as any).extension, (child as any).number);
          out.type ||= firstString((child as any).type, (child as any).transferType);
          out.status ||= firstString((child as any).status, (child as any).result, (child as any).transferStatus);
        }
      }
      if (lower === 'transferredto' || lower === 'transferdestination') out.target ||= firstString(child);
      visit(child);
    }
  };
  visit(raw);
  return out;
}

export function callLifecycleStatus(raw: any): string {
  return String(firstString(
    raw?.normalized_status,
    raw?.status,
    raw?.callStatus,
    raw?.state,
    raw?.requestState,
    raw?.callState,
    raw?.result
  ) || '').toLowerCase();
}

export function liveStatusFromCall(raw: any): 'ringing' | 'dialing' | 'on_call' | 'on_hold' | 'transferring' | null {
  const status = callLifecycleStatus(raw);
  const endedAt = firstIso(raw?.ended_at, raw?.endedAt, raw?.endTime, raw?.finishedAt, raw?.completedAt);
  if (endedAt) return null;
  if (status.includes('miss') || status.includes('complete') || status.includes('end') || status.includes('hang') || status.includes('fail') || status.includes('cancel') || status.includes('abandon') || status.includes('voice')) return null;
  if (status.includes('transfer')) return 'transferring';
  if (status.includes('hold')) return 'on_hold';
  if (status.includes('ring')) return 'ringing';
  if (status.includes('dial')) return 'dialing';
  if (status.includes('progress') || status.includes('connect') || status.includes('talk') || status.includes('busy') || status.includes('active') || status.includes('current') || status.includes('answer')) return 'on_call';
  if (raw?.currentCall || raw?.current_call || raw?.call) return 'on_call';
  return null;
}

export function arrayFromApiResponse(body: any, keys: string[] = []): any[] {
  if (Array.isArray(body)) return body;
  for (const key of keys) {
    const value = pickDeep(body, [key]);
    if (Array.isArray(value)) return value;
  }
  const candidates = [
    body?.data?.items,
    body?.data?.rows,
    body?.data?.calls,
    body?.data?.users,
    body?.data?.phoneNumbers,
    body?.data?.numbers,
    body?.data,
    body?.items,
    body?.rows,
    body?.calls,
    body?.users,
    body?.phoneNumbers,
    body?.numbers,
    body?.requests,
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function firstIso(...values: unknown[]): string | null {
  for (const value of values) {
    const text = firstString(value);
    if (!text) continue;
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

export function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  }
  return 0;
}
