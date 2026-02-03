import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[fixFK] SUPABASE_URL or SUPABASE_SERVICE_KEY not found in .env');
  process.exit(1);
}

async function applyFix() {
  const supabase = createClient(supabaseUrl as string, supabaseKey as string);
  
  console.log('[fixFK] Attempting to fix FK constraint...');
  
  // Method 1: Try using the query API directly
  try {
    console.log('[fixFK] Method 1: Attempting raw SQL via query endpoint...');
    
    // Get the current schema to verify the constraint exists
    const { data: constraints, error: checkError } = await (supabase as any)
      .from('information_schema.table_constraints')
      .select('constraint_name,table_name')
      .eq('constraint_name', 'mightycall_recordings_call_id_fkey');
    
    if (checkError) {
      console.log('[fixFK] Could not query constraints directly');
    } else if (constraints && constraints.length > 0) {
      console.log('[fixFK] Found constraint - proceeding with DROP');
    }

    // Try to drop constraint using RPC with raw SQL string
    const sqlStatements = [
      'ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;',
      'ALTER TABLE public.mightycall_recordings ALTER COLUMN call_id DROP NOT NULL;'
    ];

    // If there's an exec_sql function
    for (const sql of sqlStatements) {
      try {
        const { data, error } = await (supabase as any).rpc('exec_sql', { sql });
        if (!error) {
          console.log('[fixFK] ✓ Executed:', sql);
        } else {
          console.log('[fixFK] RPC failed:', error.message);
        }
      } catch (e: any) {
        console.log('[fixFK] RPC not available:', e.message);
      }
    }

  } catch (error: any) {
    console.error('[fixFK] Error:', error.message);
  }

  // Method 2: Try a workaround - make the call_id a UUID that doesn't reference calls
  console.log('[fixFK]');
  console.log('[fixFK] Method 2: Alternative workaround (if FK still exists)...');
  console.log('[fixFK] We can insert with stable UUIDs that dont conflict');
  
  // Test if we can insert with a non-null call_id
  const testOrgId = 'test-' + Date.now();
  const testCallId = 'rec-' + Date.now() + '-' + Math.random().toString(36).substring(7);
  
  console.log('[fixFK] Testing insert with call_id:', testCallId);
  
  try {
    const { data, error } = await supabase
      .from('mightycall_recordings')
      .insert({
        org_id: testOrgId,
        phone_number_id: null,
        call_id: testCallId,
        recording_url: 'https://test.example.com/test.mp3',
        duration_seconds: 60,
        recording_date: new Date().toISOString(),
        metadata: {}
      })
      .select();
    
    if (error) {
      if (error.message && error.message.includes('foreign key')) {
        console.log('[fixFK] ❌ FK Constraint still exists. Manual fix required.');
        console.log('[fixFK]');
        printManualInstructions();
        process.exit(1);
      } else {
        console.log('[fixFK] Insert error (not FK):', error.message);
      }
    } else {
      console.log('[fixFK] ✓ Test insert successful!');
      // Clean up test row
      await supabase
        .from('mightycall_recordings')
        .delete()
        .eq('org_id', testOrgId);
      console.log('[fixFK] ✓ Cleaned up test data');
      console.log('[fixFK]');
      console.log('[fixFK] The constraint appears to be fixed or doesnt exist.');
      console.log('[fixFK] You can now run: npm run sync:mightycall');
    }
  } catch (error: any) {
    console.error('[fixFK] Test insert error:', error.message);
    printManualInstructions();
    process.exit(1);
  }
}

function printManualInstructions() {
  console.log('[fixFK] MANUAL FIX REQUIRED:');
  console.log('[fixFK]');
  console.log('[fixFK] 1. Open Supabase Dashboard: https://supabase.com/dashboard');
  console.log('[fixFK] 2. Select your project: victorysync');
  console.log('[fixFK] 3. Go to "SQL Editor" on the left');
  console.log('[fixFK] 4. Click "New Query"');
  console.log('[fixFK] 5. Paste and execute this SQL:');
  console.log('[fixFK]');
  console.log('     ALTER TABLE public.mightycall_recordings');
  console.log('       DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;');
  console.log('');
  console.log('     ALTER TABLE public.mightycall_recordings');
  console.log('       ALTER COLUMN call_id DROP NOT NULL;');
  console.log('[fixFK]');
  console.log('[fixFK] 6. After success, run again:');
  console.log('[fixFK]    npm run sync:mightycall');
}

applyFix().catch(error => {
  console.error('[fixFK] Fatal error:', error.message);
  process.exit(1);
});
