import { config } from 'dotenv';
config();

async function dropConstraint() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  console.log('[fix] Attempting to drop mightycall_recordings FK constraint...');
  
  // Use raw SQL via Supabase
  const { data, error } = await supabaseAdmin.rpc('exec_raw_sql', {
    sql: 'ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;'
  }).catch(() => ({ error: { message: 'RPC not available' } }));

  if (error) {
    console.log('[fix] RPC not available - ' + error.message);
    console.log('[fix] Trying via Postgres...');
    
    // Alternative: try creating a simple function
    const { error: creationError } = await supabaseAdmin.rpc('exec_sql', {
      command: 'ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;'
    }).catch(() => ({ error: { message: 'SQL RPC failed' } }));
    
    if (creationError) {
      console.log('[FIX] ⚠️ Could not auto-drop constraint via RPC');
      console.log('[FIX] MANUAL FIX REQUIRED:');
      console.log('[FIX] 1. Go to Supabase Dashboard → SQL Editor');
      console.log('[FIX] 2. Run: ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;');
      console.log('[FIX] 3. Then run the sync again');
      process.exit(1);
    }
  } else {
    console.log('[fix] ✓ Constraint dropped!');
  }
}

dropConstraint().catch(e => {
  console.error('[fix] error:', e.message);
  process.exit(1);
});
