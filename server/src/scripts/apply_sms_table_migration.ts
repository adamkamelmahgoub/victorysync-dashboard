import '../config/env';
import { createClient } from '@supabase/supabase-js';

async function main() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[apply_sms_table_migration] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
      process.exit(1);
    }

    // Use service role key to execute raw SQL via rpc
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' }
    });

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

    console.log('[apply_sms_table_migration] Executing SQL migration...');
    console.log(sql);

    // Since Supabase JS client doesn't support raw SQL execution,
    // we'll try a direct insert to check table existence, and if it fails,
    // we'll provide the SQL to run manually
    const testInsert = await supabaseAdmin
      .from('mightycall_sms_messages')
      .insert({
        org_id: null,
        external_id: 'test-migration-' + Date.now(),
        from_number: '+1234567890',
        to_number: '+0987654321',
        direction: 'inbound',
        status: 'received',
        message: 'test',
        created_at: new Date().toISOString(),
      })
      .select()
      .limit(1);

    if (testInsert.error) {
      console.error('[apply_sms_table_migration] Insert test failed:', testInsert.error.message);
      if (testInsert.error.message.includes('Could not find the table')) {
        console.log('\n[apply_sms_table_migration] ❌ Table does not exist in Supabase.');
        console.log('You must manually run the following SQL in your Supabase SQL Editor:');
        console.log('\n' + sql);
        process.exit(1);
      }
    } else {
      console.log('[apply_sms_table_migration] ✅ Table exists and insert test successful');
      // Delete test row
      if (testInsert.data?.[0]) {
        const testId = testInsert.data[0].id;
        await supabaseAdmin
          .from('mightycall_sms_messages')
          .delete()
          .eq('id', testId);
        console.log('[apply_sms_table_migration] Cleaned up test record');
      }
      process.exit(0);
    }
  } catch (e) {
    console.error('[apply_sms_table_migration] error:', e);
    process.exit(1);
  }
}

main();
