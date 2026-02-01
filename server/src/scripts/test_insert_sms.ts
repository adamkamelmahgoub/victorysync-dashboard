import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const sample = {
      org_id: null, // try null to allow DB defaults, or replace with an existing org id
      phone_id: null,
      external_id: `test-${Date.now()}`,
      direction: 'inbound',
      sender: '+15551234567',
      recipient: '+15557654321',
      message: 'Test message from automated test',
      status: 'received',
      message_date: now,
      created_at: now,
    } as any;

    console.log('[test_insert_sms] inserting sample SMS into sms_logs (fallback):', sample.external_id);
    const { data, error } = await supabaseAdmin.from('sms_logs').insert({ org_id: sample.org_id, from_number: sample.sender, to_numbers: [sample.recipient], message_text: sample.message, direction: sample.direction, status: sample.status, sent_at: sample.message_date, metadata: sample }).select('*').limit(1);
    if (error) {
      console.error('[test_insert_sms] insert error:', error);
      process.exit(1);
    }
    console.log('[test_insert_sms] insert success:', data);

    // Query back
    const { data: found, error: findErr } = await supabaseAdmin
      .from('sms_logs')
      .select('*')
      .eq('message_text', sample.message)
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error('[test_insert_sms] query error:', findErr);
      process.exit(1);
    }
    console.log('[test_insert_sms] found record:', found);
    process.exit(0);
  } catch (e) {
    console.error('[test_insert_sms] unexpected error:', e);
    process.exit(1);
  }
}

main();
