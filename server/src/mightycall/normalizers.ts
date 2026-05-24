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
  const assigned = new Set(
    assignedBusinessNumbers.map(normalizePhone).filter((value): value is string => !!value)
  );
  if (fromNumber && assigned.has(fromNumber)) return 'outbound';
  if (toNumber && assigned.has(toNumber)) return 'inbound';
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
    'recordings.0.url',
    'recordings.0.mediaUrl',
    'recordings.0.audioUrl',
  ]);
  return value ? String(value) : null;
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
  const transferTarget = pickDeep(raw, [
    'transferTarget',
    'TransferTarget',
    'transferredTo',
    'TransferredTo',
    'transfer.to',
    'transfer.target',
    'legs.0.transferTarget',
    'legs.0.transferredTo',
  ]);
  const transferType = pickDeep(raw, ['transferType', 'TransferType', 'transfer.type']);
  const transferStatus = pickDeep(raw, ['transferStatus', 'TransferStatus', 'transfer.status']);
  if (!transferTarget && !transferType && !transferStatus) return null;
  return {
    transferTarget: transferTarget ? String(transferTarget) : null,
    transferType: transferType ? String(transferType) : 'unknown',
    transferStatus: transferStatus ? String(transferStatus) : 'unknown',
  };
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
