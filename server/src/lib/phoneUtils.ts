export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = ('' + raw).replace(/\D/g, '');
  if (!digits) return null;
  // If 10 digits -> assume US and prefix '1'
  if (digits.length === 10) return '1' + digits;
  // If 11 and startsWith 1 -> OK
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  // Otherwise return digits (best-effort)
  return digits;
}

export function digitsToE164(digits: string | null | undefined): string | null {
  if (!digits) return null;
  return '+' + String(digits);
}

export function normalizeToE164FromRaw(raw: string | null | undefined): string | null {
  const d = normalizePhoneDigits(raw);
  if (!d) return null;
  return digitsToE164(d);
}

export default {
  normalizePhoneDigits,
  digitsToE164,
  normalizeToE164FromRaw,
};
