import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import * as mc from '../integrations/mightycall';

async function main() {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.error('Failed to obtain Supabase admin client');
    process.exit(1);
  }

  // Date range: since August 1, 2025 to today
  const startDate = '2025-08-01';
  const endDate = new Date().toISOString().split('T')[0];

  const { data: orgs, error: orgErr } = await supabaseAdmin.from('organizations').select('id').order('id', { ascending: true });
  if (orgErr) {
    console.error('Failed to fetch organizations', orgErr);
    process.exit(1);
  }
  if (!orgs || orgs.length === 0) {
    console.info('No organizations found. Nothing to sync.');
    process.exit(0);
  }

  let totalReports = 0;
  let totalRecordings = 0;
  let totalSms = 0;

  for (const o of orgs) {
    const orgId = (o as any).id;
    console.log('\n[sync_all_orgs] starting org', orgId);

    const { data: phones } = await supabaseAdmin.from('phone_numbers').select('id').eq('org_id', orgId);
    const phoneIds = Array.isArray(phones) ? phones.map((p:any) => p.id) : [];

    try {
      console.log(`[sync_all_orgs] running reports sync for org ${orgId} (${phoneIds.length} phones) ${startDate}->${endDate}`);
      const r = await mc.syncMightyCallReports(supabaseAdmin, orgId, phoneIds, startDate, endDate);
      console.log('[sync_all_orgs] reports result', r);
      totalReports += (r?.reportsSynced || 0);
    } catch (e) {
      console.warn('[sync_all_orgs] reports sync failed for org', orgId, e);
    }

    try {
      console.log(`[sync_all_orgs] running recordings-only sync for org ${orgId}`);
      const rec = await mc.syncMightyCallRecordings(supabaseAdmin, orgId, phoneIds, startDate, endDate);
      console.log('[sync_all_orgs] recordings result', rec);
      totalRecordings += (rec?.recordingsSynced || 0);
    } catch (e) {
      console.warn('[sync_all_orgs] recordings sync failed for org', orgId, e);
    }

    try {
      console.log(`[sync_all_orgs] running sms sync for org ${orgId}`);
      const s = await mc.syncMightyCallSMS(supabaseAdmin, orgId);
      console.log('[sync_all_orgs] sms result', s);
      totalSms += (s?.smsSynced || 0);
    } catch (e) {
      console.warn('[sync_all_orgs] sms sync failed for org', orgId, e);
    }

    // small delay to avoid hammering remote API
    await new Promise((res) => setTimeout(res, 800));
  }

  console.log('\n[sync_all_orgs] complete. Totals:');
  console.log('reportsSynced:', totalReports);
  console.log('recordingsSynced:', totalRecordings);
  console.log('smsSynced:', totalSms);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('Fatal', err); process.exit(1); });
}

export default {};
