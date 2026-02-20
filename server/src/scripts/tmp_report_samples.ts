import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
(async()=>{const s=getSupabaseAdminClient(); const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
const {data}=await s.from('mightycall_reports').select('id,report_date,data').eq('org_id',org).order('report_date',{ascending:false}).limit(20);
for (const r of (data||[])) {
  const sn = Array.isArray((r as any).data?.sample_numbers) ? (r as any).data.sample_numbers : [];
  console.log(r.id, r.report_date, sn.slice(0,6));
}
process.exit(0);})();
