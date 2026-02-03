import { config } from 'dotenv';
config();
import { supabaseAdmin } from '../lib/supabaseClient';

async function check() {
  // Check how many reports are in the database
  const { data, error } = await supabaseAdmin
    .from('mightycall_reports')
    .select('id, org_id, report_date, report_type, phone_number_id')
    .limit(10);

  console.log('[check] Reports in DB:', { count: data?.length || 0, error: error?.message || 'none' });
  if (data && data.length > 0) {
    console.log('[check] Sample reports:');
    data.slice(0, 3).forEach(r => {
      console.log(`  Org ${r.org_id.substring(0, 8)}... Date: ${r.report_date} Type: ${r.report_type} Phone ID: ${r.phone_number_id}`);
    });
  }
}

check().catch(e => console.error('[check] error:', e));
