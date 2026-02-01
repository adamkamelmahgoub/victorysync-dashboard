import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { syncMightyCallReports, syncMightyCallRecordings, syncMightyCallSMS } from '../integrations/mightycall';

async function main() {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    // pick one org from organizations table
    const { data: orgs, error: orgErr } = await supabaseAdmin.from('organizations').select('id').limit(1);
    if (orgErr || !orgs || orgs.length === 0) {
      console.error('No orgs found or error', orgErr);
      process.exit(1);
    }
    const orgId = orgs[0].id;
    // get assigned phone numbers
    const { data: phones } = await supabaseAdmin.from('phone_numbers').select('id').eq('org_id', orgId);
    const phoneIds = (phones || []).map((p:any)=>p.id);

    console.log('[test_sync] running reports sync for org', orgId);
    const r = await syncMightyCallReports(supabaseAdmin, orgId, phoneIds, '2026-01-25', '2026-02-01');
    console.log('[test_sync] reports result', r);

    console.log('[test_sync] running recordings-only sync');
    const rec = await syncMightyCallRecordings(supabaseAdmin, orgId, phoneIds, '2026-01-25', '2026-02-01');
    console.log('[test_sync] recordings result', rec);

    console.log('[test_sync] running sms sync');
    const s = await syncMightyCallSMS(supabaseAdmin, orgId);
    console.log('[test_sync] sms result', s);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
