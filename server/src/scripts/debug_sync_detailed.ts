import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import * as mc from '../integrations/mightycall';

async function main() {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.error('Failed to obtain Supabase admin client');
    process.exit(1);
  }

  // Focus on the org with 4 phones
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const startDate = '2025-08-01';
  const endDate = new Date().toISOString().split('T')[0];

  console.log(`\n=== DEBUG SYNC FOR ORG ${orgId} ===`);
  console.log(`Date range: ${startDate} → ${endDate}\n`);

  // Step 1: Get org phones
  const { data: phones } = await supabaseAdmin.from('phone_numbers').select('id, number').eq('org_id', orgId);
  console.log('[DEBUG] Phone numbers for org:');
  console.log(JSON.stringify(phones, null, 2));
  const phoneIds = Array.isArray(phones) ? phones.map((p:any) => p.id) : [];

  // Step 2: Get auth token
  console.log('\n[DEBUG] Getting auth token...');
  try {
    const token = await mc.getMightyCallAccessToken();
    console.log('[DEBUG] Token obtained (first 50 chars):', token?.substring(0, 50) + '...');

    // Step 3: Fetch journal requests directly
    console.log(`\n[DEBUG] Calling fetchMightyCallJournalRequests for ${startDate}T00:00:00Z to ${endDate}T23:59:59Z`);
    const jr = await mc.fetchMightyCallJournalRequests(token, { 
      from: `${startDate}T00:00:00Z`, 
      to: `${endDate}T23:59:59Z`, 
      type: 'Call', 
      pageSize: '1000', 
      page: '1' 
    });
    console.log(`[DEBUG] Journal requests returned: ${Array.isArray(jr) ? jr.length : 0} items`);
    if (Array.isArray(jr) && jr.length > 0) {
      console.log('[DEBUG] First journal entry:', JSON.stringify(jr[0], null, 2));
      if (jr.length > 1) console.log('[DEBUG] Second journal entry:', JSON.stringify(jr[1], null, 2));
    }

    // Step 4: Fetch calls
    console.log(`\n[DEBUG] Calling fetchMightyCallCalls with filters`);
    const calls = await mc.fetchMightyCallCalls(token, { startUtc: startDate, endUtc: endDate, pageSize: '1000', skip: '0' });
    console.log(`[DEBUG] Calls returned: ${Array.isArray(calls) ? calls.length : 0} items`);
    if (Array.isArray(calls) && calls.length > 0) {
      console.log('[DEBUG] First call:', JSON.stringify(calls[0], null, 2));
      if (calls.length > 1) console.log('[DEBUG] Second call:', JSON.stringify(calls[1], null, 2));
    }

    // Step 5: Fetch recordings
    console.log(`\n[DEBUG] Calling fetchMightyCallRecordings`);
    const recordings = await mc.fetchMightyCallRecordings(token, phoneIds, startDate, endDate);
    console.log(`[DEBUG] Recordings returned: ${Array.isArray(recordings) ? recordings.length : 0} items`);
    if (Array.isArray(recordings) && recordings.length > 0) {
      console.log('[DEBUG] First recording:', JSON.stringify(recordings[0], null, 2));
    }

    // Step 6: Run the actual sync
    console.log(`\n[DEBUG] Running syncMightyCallReports...`);
    const syncResult = await mc.syncMightyCallReports(supabaseAdmin, orgId, phoneIds, startDate, endDate);
    console.log('[DEBUG] Sync result:', syncResult);

    // Step 7: Check what was actually inserted
    console.log(`\n[DEBUG] Checking mightycall_reports table for org ${orgId}...`);
    const { data: reports } = await supabaseAdmin.from('mightycall_reports').select('*').eq('org_id', orgId);
    console.log(`[DEBUG] Reports in DB: ${Array.isArray(reports) ? reports.length : 0}`);
    if (Array.isArray(reports) && reports.length > 0) {
      console.log('[DEBUG] First report:', JSON.stringify(reports[0], null, 2));
    }

    console.log(`\n[DEBUG] Checking mightycall_recordings table for org ${orgId}...`);
    const { data: recDb } = await supabaseAdmin.from('mightycall_recordings').select('*').eq('org_id', orgId);
    console.log(`[DEBUG] Recordings in DB: ${Array.isArray(recDb) ? recDb.length : 0}`);
    if (Array.isArray(recDb) && recDb.length > 0) {
      console.log('[DEBUG] First recording from DB:', JSON.stringify(recDb[0], null, 2));
    }

  } catch (e) {
    console.error('[DEBUG] Error:', e);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('Fatal', err); process.exit(1); });
}

export default {};
