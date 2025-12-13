import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';

async function main() {
  const supabaseAdmin = getSupabaseAdminClient();
  const orgId = process.argv[2] || 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const number = process.argv[3] || '+18482161220';
  const digits = normalizePhoneDigits(number)!;
  console.log('[check_assigned_calls] orgId:', orgId, 'number:', number, 'digits:', digits);

  const days = Number(process.argv[4] || '1');
  const now = new Date();
  const start = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString();
  const end = now.toISOString();
  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('id,org_id,to_number,to_number_digits,status,started_at,answered_at,ended_at')
    .eq('org_id', orgId)
    .or(`to_number.eq.${number},to_number_digits.eq.${digits}`)
    .gte('started_at', start)
    .lte('started_at', end)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) { console.error('[check_assigned_calls] query error:', error); return; }
  console.log('[check_assigned_calls] rows found:', (data || []).length);
  for (const r of data || []) console.log(JSON.stringify(r, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
