#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);

async function test() {
  console.log('Testing query without order...');
  
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  
  try {
    // Query without order
    const { data, error } = await supabase
      .from('mightycall_recordings')
      .select('*')
      .eq('org_id', orgId)
      .limit(2);
    
    if (error) throw error;
    console.log('✅ Query without order worked, got', data.length, 'records');
    
    // Now try with order
    console.log('\nTesting query WITH order...');
    const { data: data2, error: error2 } = await supabase
      .from('mightycall_recordings')
      .select('*')
      .eq('org_id', orgId)
      .order('recording_date', { ascending: false })
      .limit(2);
    
    if (error2) {
      console.log('❌ Error with order:', error2.message);
      console.log('Full error:', JSON.stringify(error2, null, 2));
    } else {
      console.log('✅ Query with order worked, got', data2.length, 'records');
    }

  } catch (error) {
    console.error(`Error:`, error.message);
  }
  
  process.exit(0);
}

test();
