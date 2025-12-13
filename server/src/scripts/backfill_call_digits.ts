import '../config/env';
import { supabaseAdmin } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';

async function backfill() {
  console.log('[backfill_call_digits] Starting backfill: setting to_number_digits for calls from to_number (batched)');
  try {
    const BATCH = 500;
    let updated = 0;
    while (true) {
      const { data: rows, error } = await supabaseAdmin
        .from('calls')
        .select('id, to_number, from_number, to_number_digits, from_number_digits')
        .or('to_number_digits.is.null,from_number_digits.is.null')
        .limit(BATCH);
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const updates: any = {};
        if (!r.to_number_digits) {
          const digits = normalizePhoneDigits(r.to_number as string | null);
          if (digits) updates.to_number_digits = digits;
        }
        if (!r.from_number_digits) {
          const fdigits = normalizePhoneDigits(r.from_number as string | null);
          if (fdigits) updates.from_number_digits = fdigits;
        }
        if (Object.keys(updates).length === 0) continue;
        const { error: upErr } = await supabaseAdmin.from('calls').update(updates).eq('id', r.id);
        if (upErr) console.warn('[backfill_call_digits] update error for id', r.id, upErr);
        else updated++;
      }
      console.log('[backfill_call_digits] updated batch, total updated:', updated);
      if (!rows || rows.length < BATCH) break;
    }
    console.log('[backfill_call_digits] backfill completed, total updated:', updated);
  } catch (e) {
    console.error('[backfill_call_digits] exception:', e);
    process.exit(1);
  }
}

backfill();
