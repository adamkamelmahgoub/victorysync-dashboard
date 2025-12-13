import './env';
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
        .select('id, to_number')
        .is('to_number_digits', null)
        .limit(BATCH);
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const digits = normalizePhoneDigits(r.to_number as string | null);
        if (!digits) continue;
        const { error: upErr } = await supabaseAdmin.from('calls').update({ to_number_digits: digits }).eq('id', r.id);
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
