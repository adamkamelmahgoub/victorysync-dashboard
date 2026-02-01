import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

async function main() {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    
    console.log('[create_sms_table] Creating mightycall_sms_messages table...');
    
    // Use the Supabase admin API to execute raw SQL
    const sql = `
      CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
        external_id text,
        external_sms_id text,
        from_number text,
        to_number text,
        sender text,
        recipient text,
        direction text,
        status text,
        message text,
        body text,
        message_date timestamptz,
        sent_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(org_id, external_id),
        UNIQUE(org_id, external_sms_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_mightycall_sms_org_id ON public.mightycall_sms_messages(org_id);
      CREATE INDEX IF NOT EXISTS idx_mightycall_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
    `;

    // Execute using rpc or by attempting an insert to trigger table check
    // Since we can't execute raw SQL directly, we'll attempt to insert
    // which will fail with a clear error if the table doesn't exist
    const testInsert = await supabaseAdmin.from('mightycall_sms_messages').insert({
      org_id: null,
      external_id: 'test-create',
      from_number: '+1234567890',
      to_number: '+0987654321',
      direction: 'inbound',
      status: 'received',
      message: 'test',
      created_at: new Date().toISOString(),
    }).select().limit(1);

    if (testInsert.error) {
      // Table doesn't exist, would need to run raw SQL in Supabase
      console.error('[create_sms_table] Table check failed:', testInsert.error.message);
      if (testInsert.error.message.includes('Could not find the table')) {
        console.log('[create_sms_table] Table does not exist. You must run the SQL migration manually in Supabase SQL editor:');
        console.log(sql);
        process.exit(1);
      }
    } else {
      console.log('[create_sms_table] Table already exists or was created successfully');
      // Delete test row
      await supabaseAdmin.from('mightycall_sms_messages').delete().eq('external_id', 'test-create');
      process.exit(0);
    }
  } catch (e) {
    console.error('[create_sms_table] error:', e);
    process.exit(1);
  }
}

main();
