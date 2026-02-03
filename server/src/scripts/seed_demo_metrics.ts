import 'dotenv/config';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  const supabase = getSupabaseAdminClient();
  const orgId = process.argv[2] || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  console.log('[metrics-seed] orgId:', orgId);

  const metrics = {
    org_id: orgId,
    total_calls: 12,
    answered_calls: 9,
    answer_rate_pct: 75,
    avg_wait_seconds: 18,
  };

  const { data, error } = await supabase.from('client_metrics_today').upsert(metrics).select('*');
  if (error) {
    console.error('[metrics-seed] upsert error', error);
    process.exit(2);
  }

  console.log('[metrics-seed] upsert result:', data);
  process.exit(0);
}

main().catch((e) => { console.error('[metrics-seed] fatal', e); process.exit(2); });
