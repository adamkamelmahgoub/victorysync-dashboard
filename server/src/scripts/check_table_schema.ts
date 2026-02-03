import { config } from 'dotenv';
config();

async function checkTableSchema() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  console.log('[check] Getting table constraints...');
  
  try {
    // Query the information_schema to see constraints
    let data: any = null;
    try {
      const res = await supabase.rpc('get_table_constraints', {
        table_name: 'mightycall_recordings',
        schema_name: 'public'
      });
      data = (res as any).data ?? null;
    } catch (e) {
      data = null;
    }

    if (data) {
      console.log('[check] Constraints found:', JSON.stringify(data, null, 2));
    } else {
      console.log('[check] Could not query via RPC');
      
      // Alternative: just try to insert a test row with null call_id
      console.log('[check] Testing if null call_id is allowed...');
      const testId = `test-${Date.now()}`;
      const { error: insertError } = await supabase
        .from('mightycall_recordings')
        .insert({
          org_id: 'test-org',
          phone_number_id: null,
          call_id: null,
          recording_url: 'https://example.com/test.mp3',
          duration_seconds: 0,
          recording_date: new Date().toISOString(),
          metadata: { test: true }
        });
      
      if (insertError) {
        console.log('[check] ❌ Insert with null call_id failed:', insertError.message);
        if (insertError.message.includes('foreign key')) {
          console.log('[check] ⚠️  FK constraint is the issue');
        }
      } else {
        console.log('[check] ✓ Insert with null call_id succeeded');
      }
    }
  } catch (error: any) {
    console.error('[check] Error:', error.message);
  }
}

checkTableSchema().catch(e => console.error('[check] Fatal:', e.message));
