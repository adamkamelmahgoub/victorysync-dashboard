import '../config/env';
import { getMightyCallAccessToken, fetchMightyCallPhoneNumbers } from '../integrations/mightycall';
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

    const rows = numbers.map(n => ({
      external_id: n.externalId,
      e164: n.e164,
      number: n.number,
      number_digits: n.numberDigits,
      label: n.label,
      is_active: n.isActive,
    }));

    const { data, error } = await supabase
      .from('phone_numbers')
      .upsert(rows, { onConflict: 'external_id' });

    if (error) {
      console.error('[MightyCall sync] upsert error', error);
      throw error;
    }

    console.info('[MightyCall sync] upserted', data?.length ?? rows.length, 'rows into phone_numbers');
    console.info('[MightyCall sync] complete');
    process.exit(0);
  } catch (err) {
    console.error('[MightyCall sync] fatal error', err);
    process.exit(1);
  }
}

main();
