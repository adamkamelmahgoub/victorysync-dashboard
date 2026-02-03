import 'dotenv/config';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  const supabase = getSupabaseAdminClient();
  const orgId = process.argv[2] || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  const demoNumbers = process.argv[3] ? process.argv[3].split(',') : ['+17323286846', '+12122357403'];

  console.log('[seed] orgId:', orgId);
  console.log('[seed] demoNumbers:', demoNumbers);

  // Find phone_numbers records for these numbers (if present)
  const { data: phones, error: phonesErr } = await supabase
    .from('phone_numbers')
    .select('id,number')
    .in('number', demoNumbers);

  if (phonesErr) {
    console.error('[seed] error fetching phone_numbers:', phonesErr);
    process.exit(2);
  }

  if (!phones || phones.length === 0) {
    console.warn('[seed] no matching phone_numbers found; creating placeholder phone_numbers');
    // create phone numbers entries
    const toInsert = demoNumbers.map((n) => ({ number: n, org_id: orgId, external_id: `demo-${n.replace(/[^0-9]/g,'')}` }));
    const { data: created, error: createErr } = await supabase.from('phone_numbers').insert(toInsert).select('id,number');
    if (createErr) { console.error('[seed] failed to create phone_numbers', createErr); process.exit(2); }
    phones && (phones.length = 0);
    // Use created
  }

  // Refresh phones list (fetch by numbers)
  const { data: phoneRows } = await supabase.from('phone_numbers').select('id,number').in('number', demoNumbers);
  const phonesList = phoneRows || [];

  console.log('[seed] phone rows:', phonesList.map((p: any) => ({ id: p.id, number: p.number })));

  // Create demo calls and recordings for each phone
  const now = Date.now();
  const callsToInsert: any[] = [];
  for (let i = 0; i < phonesList.length; i++) {
    const ph = phonesList[i];
    const started = new Date(now - (i + 1) * 60 * 60 * 1000); // 1hr,2hr ago
    const answered = new Date(started.getTime() + 15 * 1000);
    const duration = 45 + i * 10;
    callsToInsert.push({
      org_id: orgId,
      to_number: ph.number,
      from_number: i === 0 ? '+15551234567' : '+15559876543',
      status: 'completed',
      started_at: started.toISOString(),
      answered_at: answered.toISOString(),
      ended_at: new Date(answered.getTime() + duration * 1000).toISOString(),
      duration_seconds: duration,
    });
  }

  const { data: insertedCalls, error: callErr } = await supabase.from('calls').insert(callsToInsert).select('*');
  if (callErr) { console.error('[seed] failed to insert calls', callErr); process.exit(2); }
  console.log('[seed] inserted calls count:', insertedCalls?.length);

  // Insert recordings linked to calls and phone numbers
  const recordingsToInsert: any[] = [];
  for (let i = 0; i < insertedCalls.length; i++) {
    const c = insertedCalls[i];
    const phone = phonesList[i];
    recordingsToInsert.push({
      org_id: orgId,
      phone_number_id: phone.id,
      call_id: c.id || c.external_id || `demo-call-${i}`,
      recording_url: `https://example.com/demo/recording-${i}.mp3`,
      duration_seconds: c.duration_seconds || 30,
      recording_date: c.started_at,
    });
  }

  const { data: recsInserted, error: recErr } = await supabase.from('mightycall_recordings').insert(recordingsToInsert).select('*');
  if (recErr) { console.error('[seed] failed to insert recordings', recErr); process.exit(2); }
  console.log('[seed] inserted recordings count:', recsInserted?.length);

  console.log('[seed] done');
  process.exit(0);
}

main().catch((e) => { console.error('[seed] fatal', e); process.exit(2); });
