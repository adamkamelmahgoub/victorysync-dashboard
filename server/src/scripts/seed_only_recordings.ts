import 'dotenv/config';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import crypto from 'crypto';

async function main() {
  const supabase = getSupabaseAdminClient();
  const orgId = process.argv[2] || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  const demoNumbers = process.argv[3] ? process.argv[3].split(',') : ['+17323286846', '+12122357403'];

  console.log('[seed-recordings] orgId:', orgId);
  console.log('[seed-recordings] demoNumbers:', demoNumbers);

  const { data: phoneRows, error: phoneErr } = await supabase.from('phone_numbers').select('id,number').in('number', demoNumbers);
  if (phoneErr) { console.error('[seed-recordings] phone lookup error', phoneErr); process.exit(2); }
  const phonesList = phoneRows || [];
  if (!phonesList.length) { console.warn('[seed-recordings] no phone numbers found for demo; exiting'); process.exit(0); }

  const now = Date.now();
  const recs: any[] = [];
  for (let i = 0; i < phonesList.length; i++) {
    const phone = phonesList[i];
    const started = new Date(now - (i + 1) * 45 * 60 * 1000).toISOString();
    recs.push({
      org_id: orgId,
      phone_number_id: phone.id,
      call_id: crypto.randomUUID(),
      recording_url: `https://example.com/demo/recording-${i}.mp3`,
      duration_seconds: 30 + i * 5,
      recording_date: started,
    });
  }

  const { data: inserted, error } = await supabase.from('mightycall_recordings').insert(recs).select('*');
  if (error) { console.error('[seed-recordings] insert error', error); process.exit(2); }
  console.log('[seed-recordings] inserted recordings:', inserted?.length || 0);
  process.exit(0);
}

main().catch((e) => { console.error('[seed-recordings] fatal', e); process.exit(2); });
