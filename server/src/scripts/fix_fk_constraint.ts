import { config } from 'dotenv';
config();
import { supabaseAdmin } from '../lib/supabaseClient';

async function fix() {
  console.log('[fix] Dropping FK constraint on mightycall_recordings.call_id...');
  
  let rpcErr: any = null;
  try {
    const res = await supabaseAdmin.rpc('exec_sql', {
      sql: 'ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;'
    });
    rpcErr = (res as any).error ?? null;
  } catch (e) {
    console.log('[fix] RPC not available, trying direct approach...');
    rpcErr = { message: 'rpc not available' };
  }

  if (!rpcErr) {
    console.log('[fix] ✓ FK constraint dropped successfully');
  } else {
    console.log('[fix] ✗ Could not drop FK via RPC, will try manual SQL...');
    // The constraint might already be gone, or needs manual intervention
    // Try inserting a test recording to verify
    const testResult = await supabaseAdmin
      .from('mightycall_recordings')
      .insert({
        org_id: 'test-org',
        call_id: 'test-call',
        recording_url: 'test',
        recording_date: new Date().toISOString()
      })
      .select();
    
    if (testResult.error && testResult.error.message.includes('FK')) {
      console.log('[fix] FK constraint still exists - needs manual removal in Supabase console');
    } else if (!testResult.error) {
      console.log('[fix] ✓ Test insert succeeded - FK constraint is not blocking inserts');
      // Clean up test row
      await supabaseAdmin
        .from('mightycall_recordings')
        .delete()
        .eq('call_id', 'test-call');
    }
  }
}

fix().catch(e => console.error('[fix] error:', e));
