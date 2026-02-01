import { getSupabaseAdminClient } from '../src/lib/supabaseClient';
import {
  syncMightyCallPhoneNumbers,
  syncMightyCallCallHistory,
  syncMightyCallReports,
  syncMightyCallRecordings
} from '../src/integrations/mightycall';

async function main() {
  try {
    const supabase = getSupabaseAdminClient();

    console.log('[sync-script] fetching organizations...');
    const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id,name');
    if (orgErr) {
      console.error('[sync-script] failed to load organizations', orgErr);
      process.exit(1);
    }

    if (!Array.isArray(orgs) || orgs.length === 0) {
      console.log('[sync-script] no organizations found');
      process.exit(0);
    }

    for (const org of orgs) {
      const orgId = org.id;
      const orgName = org.name || orgId;
      console.log(`\n[sync-script] syncing org ${orgName} (${orgId})`);

      try {
        const phones = await syncMightyCallPhoneNumbers(supabase);
        console.log(`[sync-script][${orgId}] phones upserted:`, phones.upserted);
      } catch (e) {
        console.warn(`[sync-script][${orgId}] phone sync failed:`, e?.message || e);
      }

      try {
        const callsResult = await syncMightyCallCallHistory(supabase, orgId);
        console.log(`[sync-script][${orgId}] calls synced:`, callsResult.callsSynced);
      } catch (e) {
        console.warn(`[sync-script][${orgId}] call history sync failed:`, e?.message || e);
      }

      // Sync reports for last 7 days as an example
      try {
        const end = new Date();
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        const reportsResult = await syncMightyCallReports(supabase, orgId, [], startIso, endIso);
        console.log(`[sync-script][${orgId}] reports synced:`, reportsResult.reportsSynced, 'recordings:', reportsResult.recordingsSynced);
      } catch (e) {
        console.warn(`[sync-script][${orgId}] reports sync failed:`, e?.message || e);
      }

      // Sync recordings separately for same range
      try {
        const end = new Date();
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const startIso = start.toISOString();
        const endIso = end.toISOString();
        const recs = await syncMightyCallRecordings(supabase, orgId, [], startIso, endIso);
        console.log(`[sync-script][${orgId}] recordings synced (standalone):`, recs.recordingsSynced);
      } catch (e) {
        console.warn(`[sync-script][${orgId}] recordings sync failed:`, e?.message || e);
      }
    }

    console.log('\n[sync-script] done');
    process.exit(0);
  } catch (err) {
    console.error('[sync-script] fatal error', err);
    process.exit(2);
  }
}

main();
