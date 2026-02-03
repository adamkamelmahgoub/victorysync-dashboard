import { config } from 'dotenv';
config();
import { supabaseAdmin } from '../lib/supabaseClient';

async function verify() {
  const { data: reports, error } = await supabaseAdmin
    .from('mightycall_reports')
    .select('id, org_id, report_date, report_type, data')
    .limit(5);

  console.log('[verify] Reports in DB:');
  console.log(`  Total sample: ${reports?.length || 0}`);
  if (reports && reports.length > 0) {
    reports.forEach(r => {
      console.log(`  - Date: ${r.report_date}, Type: ${r.report_type}, Calls: ${r.data?.calls_count || 0}`);
    });
  }

  const { count } = await supabaseAdmin
    .from('mightycall_reports')
    .select('id', { count: 'exact', head: true });

  console.log(`\n[verify] Total reports in DB: ${count}`);
}

verify().catch(e => console.error('[verify] error:', e));
