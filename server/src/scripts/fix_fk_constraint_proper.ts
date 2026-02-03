import { config } from 'dotenv';
config();

async function fixFKConstraint() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || '',
    { db: { schema: 'public' } }
  );

  console.log('[fixFK] Applying database fixes...');
  
  try {
    // Drop the FK constraint
    console.log('[fixFK] Step 1: Dropping FK constraint mightycall_recordings_call_id_fkey...');
    const { data: dropData, error: dropError } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey'
    }).catch(() => ({ error: { message: 'Method not available' } }));
    
    if (dropError && !dropError.message.includes('not available')) {
      console.log('[fixFK] Error dropping constraint:', dropError.message);
    } else if (dropError) {
      console.log('[fixFK] RPC not available, will need manual fix');
    } else {
      console.log('[fixFK] ✓ FK constraint dropped');
    }

    // Make call_id nullable
    console.log('[fixFK] Step 2: Making call_id nullable...');
    const { data: nullData, error: nullError } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE public.mightycall_recordings ALTER COLUMN call_id DROP NOT NULL'
    }).catch(() => ({ error: { message: 'Method not available' } }));

    if (nullError && !nullError.message.includes('not available')) {
      console.log('[fixFK] Error making nullable:', nullError.message);
    } else if (nullError) {
      console.log('[fixFK] RPC not available for nullable change');
    } else {
      console.log('[fixFK] ✓ call_id made nullable');
    }

    console.log('[fixFK] ✅ Database fix complete!');
    console.log('[fixFK] You can now run: npm run sync:mightycall');
    
  } catch (error: any) {
    console.error('[fixFK] ❌ Error:', error.message);
    console.log('[fixFK]');
    console.log('[fixFK] MANUAL FIX REQUIRED:');
    console.log('[fixFK] Go to Supabase Dashboard > SQL Editor and run:');
    console.log('[fixFK]');
    console.log('[fixFK]   ALTER TABLE public.mightycall_recordings');
    console.log('[fixFK]     DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;');
    console.log('[fixFK]');
    console.log('[fixFK]   ALTER TABLE public.mightycall_recordings');
    console.log('[fixFK]     ALTER COLUMN call_id DROP NOT NULL;');
    console.log('[fixFK]');
    process.exit(1);
  }
}

fixFKConstraint().catch(e => {
  console.error('[fixFK] Fatal error:', e.message);
  process.exit(1);
});
