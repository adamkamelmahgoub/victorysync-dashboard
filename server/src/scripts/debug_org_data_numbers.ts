import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

(async () => {
  const s = getSupabaseAdminClient();
  const org = 'b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';

  const { data: reports } = await s.from('mightycall_reports').select('data,report_date').eq('org_id', org).order('report_date', { ascending: false }).limit(300);
  const nums = new Map<string, number>();
  for (const r of reports || []) {
    const sample = (r as any)?.data?.sample_numbers;
    if (Array.isArray(sample)) {
      for (const n of sample) {
        const key = String(n || '').trim();
        if (!key) continue;
        nums.set(key, (nums.get(key) || 0) + 1);
      }
    }
  }

  const sorted = Array.from(nums.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
  console.log('top_report_numbers', sorted);

  for (const [num] of sorted.slice(0,10)) {
    const c = await s.from('calls').select('id', {count:'exact', head:true}).eq('org_id', org).or(`from_number.eq.${num},to_number.eq.${num}`);
    const r = await s.from('mightycall_recordings').select('id', {count:'exact', head:true}).eq('org_id', org).or(`from_number.eq.${num},to_number.eq.${num}`);
    const m = await s.from('mightycall_sms_messages').select('id', {count:'exact', head:true}).eq('org_id', org).or(`from_number.eq.${num},to_number.eq.${num}`);
    console.log(num, { calls: c.count || 0, recordings: r.count || 0, sms: m.count || 0 });
  }

  process.exit(0);
})();
