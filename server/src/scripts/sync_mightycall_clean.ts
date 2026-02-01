import '../config/env';
import { getMightyCallAccessToken, fetchMightyCallPhoneNumbers, syncMightyCallPhoneNumbers } from '../integrations/mightycall';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  try {
    console.info('[MightyCall sync] starting');
    const supabase = getSupabaseAdminClient();

    const token = await getMightyCallAccessToken();
    console.info('[MightyCall sync] got access token');

    const numbers = await fetchMightyCallPhoneNumbers(token);
    console.info('[MightyCall sync] fetched', numbers.length, 'phone numbers');

    if (numbers.length === 0) {
      console.info('[MightyCall sync] no phone numbers to upsert');
      process.exit(0);
    }

    // Delegate to integration helper which handles upsert/update edge-cases
    const { upserted } = await syncMightyCallPhoneNumbers(supabase as any);
    console.info('[MightyCall sync] upserted', upserted, 'rows into phone_numbers');
    console.info('[MightyCall sync] complete');
    process.exit(0);
  } catch (err) {
    console.error('[MightyCall sync] fatal error', err);
    process.exit(1);
  }
}

main();
