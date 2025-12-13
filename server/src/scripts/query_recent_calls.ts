import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  const supabaseAdmin = getSupabaseAdminClient();
  const orgId = process.argv[2] || 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  console.log('[query_recent_calls] orgId:', orgId);
  const { data: phones, error: phoneErr } = await supabaseAdmin
    .from('org_phone_numbers')
    .select('id,org_id, phone_number_id, phone_number, label, created_at');
  if (phoneErr) { console.error('[query_recent_calls] org_phone_numbers error', phoneErr); return; }
  // For readability, show recent calls in last 24 hours
  const { data: rows, error } = await supabaseAdmin
    .from('calls')
    .select('id,org_id,to_number,to_number_digits,status,started_at,answered_at,ended_at')
    .eq('org_id', orgId)
    .gte('started_at', new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) { console.error('[query_recent_calls] error', error); return; }
  console.log('[query_recent_calls] rows found:', rows?.length || 0);
  for (const r of rows || []) {
    console.log(JSON.stringify(r, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
