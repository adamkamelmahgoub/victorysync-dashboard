export type LivePresenceStatus = 'available' | 'ringing' | 'on_call' | 'offline' | 'unknown';
export type CallOutcomeStatus = 'answered' | 'missed' | 'abandoned' | 'failed' | 'voicemail' | 'completed' | 'unknown';
export type SmsDirection = 'inbound' | 'outbound' | 'unknown';

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

export function formatSeconds(value: unknown) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}

export function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
