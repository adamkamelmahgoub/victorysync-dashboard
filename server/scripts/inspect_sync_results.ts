import { getSupabaseAdminClient } from '../src/lib/supabaseClient';

async function main() {
  try {
    const supabase = getSupabaseAdminClient();

    console.log('[inspect] querying phone_numbers count and samples');
    const { count: pnCount, data: pnData, error: pnErr } = await supabase.from('phone_numbers').select('id,external_id,number,label', { count: 'exact' }).limit(10);
    if (pnErr) console.error('[inspect] phone_numbers error', pnErr);
    console.log('[inspect] phone_numbers count/sample:', pnCount, JSON.stringify(pnData, null, 2));

    console.log('\n[inspect] querying calls count and samples');
    const { count: callsCount, data: callsData, error: callsErr } = await supabase.from('calls').select('id,org_id,external_id,from_number,to_number,status,duration_seconds,started_at', { count: 'exact' }).limit(10);
    if (callsErr) console.error('[inspect] calls error', callsErr);
    console.log('[inspect] calls count/sample:', callsCount, JSON.stringify(callsData, null, 2));

    console.log('\n[inspect] querying mightycall_recordings count and samples');
    const { count: recCount, data: recData, error: recErr } = await supabase.from('mightycall_recordings').select('id,org_id,phone_number_id,call_id,recording_url,duration_seconds,recording_date', { count: 'exact' }).limit(10);
    if (recErr) console.error('[inspect] mightycall_recordings error', recErr);
    console.log('[inspect] mightycall_recordings count/sample:', recCount, JSON.stringify(recData, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('[inspect] fatal', err);
    process.exit(2);
  }
}

main();
