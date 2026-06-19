export type LivePresenceStatus = 'available' | 'ringing' | 'on_call' | 'offline' | 'unknown';
export type CallOutcomeStatus = 'answered' | 'missed' | 'abandoned' | 'failed' | 'voicemail' | 'completed' | 'unknown';
export type SmsDirection = 'inbound' | 'outbound' | 'unknown';
export type CallDirection = 'inbound' | 'outbound' | 'internal' | 'unknown';

export type DateRange = {
  start?: string;
  end?: string;
};

export function normalizePhoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

export function formatPhoneNumber(value: unknown) {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(value || '').trim() || '-';
}

export function normalizeCallStatus(value: unknown): CallOutcomeStatus {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('abandon')) return 'abandoned';
  if (text.includes('voice')) return 'voicemail';
  if (text.includes('miss') || text.includes('no answer')) return 'missed';
  if (text.includes('fail') || text.includes('busy') || text.includes('cancel')) return 'failed';
  if (text.includes('answer') || text.includes('connect') || text.includes('complete')) return text.includes('complete') ? 'completed' : 'answered';
  return 'unknown';
}

export function normalizeSmsDirection(value: unknown, fromNumber?: unknown, ownedDigits?: Set<string>): SmsDirection {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  const fromDigits = normalizePhoneDigits(fromNumber);
  if (ownedDigits && fromDigits) return ownedDigits.has(fromDigits) ? 'outbound' : 'inbound';
  return 'unknown';
}

export function normalizeCallDirection(value: unknown, fromNumber?: unknown, ownedDigits?: Set<string>): CallDirection {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('internal')) return 'internal';
  if (text.includes('out')) return 'outbound';
  if (text.includes('in')) return 'inbound';
  if (text === 'sent' || text === 'api' || text === 'external') return 'outbound';
  if (text === 'received') return 'inbound';
  const fromDigits = normalizePhoneDigits(fromNumber);
  if (ownedDigits && fromDigits) return ownedDigits.has(fromDigits) ? 'outbound' : 'inbound';
  return 'unknown';
}

export function normalizeLivePresenceStatus(value: unknown, onCall?: boolean, stale?: boolean): LivePresenceStatus {
  const text = String(value || '').trim().toLowerCase();
  if (stale && !onCall) return 'unknown';
  if (onCall || text.includes('on_call') || text.includes('on call') || text.includes('talk') || text.includes('connect') || text.includes('busy')) return 'on_call';
  if (text.includes('ring')) return 'ringing';
  if (text.includes('dial')) return 'ringing';
  if (text.includes('offline') || text.includes('dnd') || text.includes('disturb')) return 'offline';
  if (text.includes('available') || text.includes('idle') || text.includes('ready') || text === 'free') return 'available';
  return 'unknown';
}

export function answerRate(answered: number, total: number) {
  return total > 0 ? Math.round((answered / total) * 1000) / 10 : 0;
}

export function countTotalCalls(rows: Array<Record<string, any>>) {
  return rows.length;
}

export function countAnsweredCalls(rows: Array<Record<string, any>>) {
  return rows.filter((row) => ['answered', 'completed'].includes(normalizeCallStatus(row.status || row.result || row.call_status))).length;
}

export function averageHandleTimeSeconds(rows: Array<Record<string, any>>) {
  const durations = rows
    .map((row) => Number(row.duration_seconds ?? row.duration ?? row.handle_time_seconds ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
}

export function countMissedCalls(rows: Array<Record<string, any>>) {
  return rows.filter((row) => ['missed', 'abandoned', 'failed'].includes(normalizeCallStatus(row.status || row.result || row.call_status))).length;
}

export function countTransfers(rows: Array<Record<string, any>>) {
  return rows.filter((row) => {
    const haystack = JSON.stringify({
      transfer_target: row.transfer_target,
      transfer_type: row.transfer_type,
      transfer_status: row.transfer_status,
      metadata: row.metadata,
      raw_payload: row.raw_payload,
    }).toLowerCase();
    return haystack.includes('transfer');
  }).length;
}

export function countRecordingsAvailable(rows: Array<Record<string, any>>) {
  return rows.filter((row) => hasRecording(row)).length;
}

export function hasRecording(row: Record<string, any>) {
  return Boolean(row.recording_url || row.recordingUrl || row.recording_id || row.recordingId || row.has_recording || row.hasRecording);
}

export function calculateAnswerRateFromRows(rows: Array<Record<string, any>>) {
  return answerRate(countAnsweredCalls(rows), countTotalCalls(rows));
}

export function filterRowsByDateRange<T extends Record<string, any>>(rows: T[], range: DateRange, fieldNames = ['created_at', 'timestamp', 'started_at', 'date_time', 'date']) {
  const startTime = range.start ? new Date(`${range.start}T00:00:00.000Z`).getTime() : Number.NEGATIVE_INFINITY;
  const endTime = range.end ? new Date(`${range.end}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  return rows.filter((row) => {
    const raw = fieldNames.map((field) => row[field]).find(Boolean);
    if (!raw) return true;
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time)) return true;
    return time >= startTime && time <= endTime;
  });
}

export function formatSeconds(value: unknown) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}

export const formatDuration = formatSeconds;

export function formatPercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0%';
  return `${Math.round(number * 10) / 10}%`;
}

export function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
