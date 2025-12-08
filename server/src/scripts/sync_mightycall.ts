import '../config/env';

// Legacy / corrupted sync script replaced by `sync_mightycall_clean.ts`.
// Keep a small shim to avoid accidental duplicate dotenv calls.

// No-op export; the real script is `src/scripts/sync_mightycall_clean.ts`.
export default {};
import dotenv from 'dotenv';
import { fetchMightyCallPhoneNumbers } from '../lib/mightycallClient';
import { supabaseAdmin } from '../lib/supabaseClient';

dotenv.config();

// Validate required env vars early
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}
if (!process.env.MIGHTYCALL_API_KEY || !process.env.MIGHTYCALL_USER_KEY || !process.env.MIGHTYCALL_BASE_URL) {
  console.error('MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, and MIGHTYCALL_BASE_URL must be set');
  process.exit(1);
}

async function run() {
  try {
    console.log('Starting MightyCall phone numbers sync...');

    const fetched = await fetchMightyCallPhoneNumbers();
    console.log(`[MightyCall sync] fetched ${fetched.length} phone numbers`);

    const payload = fetched
      .map((n: any) => {
        const numberVal = n.e164 ?? n.phoneNumber ?? n.number ?? null;
        const normalized = numberVal ? String(numberVal) : null;
        return {
          import dotenv from 'dotenv';
          import { fetchMightyCallPhoneNumbers } from '../lib/mightycallClient';
          import { supabaseAdmin } from '../lib/supabaseClient';

          dotenv.config();

          // Validate required env vars early
          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
            process.exit(1);
          }
          if (!process.env.MIGHTYCALL_API_KEY || !process.env.MIGHTYCALL_USER_KEY || !process.env.MIGHTYCALL_BASE_URL) {
            console.error('MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY, and MIGHTYCALL_BASE_URL must be set');
            process.exit(1);
          }

          async function run() {
            try {
              console.log('Starting MightyCall phone numbers sync...');

              const fetched = await fetchMightyCallPhoneNumbers();
              console.log(`[MightyCall sync] fetched ${fetched.length} phone numbers`);

              const payload = fetched
                .map((n: any) => {
                  const numberVal = n.e164 ?? n.phoneNumber ?? n.number ?? null;
                  const normalized = numberVal ? String(numberVal) : null;
                  return {
                    number: normalized,
                    e164: normalized,
                    number_digits: (normalized || '').replace(/\D/g, ''),
                    label: n.name ?? n.label ?? null,
                    is_active: n.isActive ?? true,
                  };
                })
                .filter((p: any) => p.number);

              if (payload.length === 0) {
                console.log('[MightyCall sync] no valid phone records to upsert');
              } else {
                const { error: upsertError } = await supabaseAdmin.from('phone_numbers').upsert(payload, { onConflict: 'number' });
                if (upsertError) {
                  console.error('[MightyCall sync] Failed to upsert phone_numbers:', upsertError);
                  process.exit(1);
                }
                console.log(`[MightyCall sync] upserted ${payload.length} phone numbers`);
              }

              const { data: phones, error: fetchPhonesErr } = await supabaseAdmin
                .from('phone_numbers')
                .select('id, number, e164, number_digits, org_id, label, is_active')
                .order('created_at', { ascending: true });

              if (fetchPhonesErr) console.error('[MightyCall sync] Failed to fetch phone_numbers:', fetchPhonesErr);
              else console.log('[MightyCall sync] phone_numbers rows:', JSON.stringify(phones || [], null, 2));

              console.log('[MightyCall sync] complete');
              process.exit(0);
            } catch (err) {
              console.error('[MightyCall sync] Sync error', err);
              process.exit(2);
            }
          }

          run();
          number: normalized,
