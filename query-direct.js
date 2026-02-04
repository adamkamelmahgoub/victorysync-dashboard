#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const userId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk',
  { auth: { persistSession: false } }
);

async function test() {
  console.log('Directly querying database...');
  console.log(`Org: ${orgId}\n`);
  
  try {
    // Test 1: Can we query recordings directly?
    console.log('1. Query mightycall_recordings directly:');
    const { data, error } = await supabase
      .from('mightycall_recordings')
      .select('id, org_id, phone_number_id, call_id, recording_url, duration_seconds')
      .eq('org_id', orgId)
      .limit(5);
    
    if (error) throw error;
    console.log(`   ✅ Got ${data.length} recordings`);
    if (data.length > 0) {
      console.log(`   Sample:`, JSON.stringify(data[0], null, 2).substring(0, 300));
    }

    // Test 2: Verify user is in org
    console.log(`\n2. Verify user ${userId} is member of org:`);
    const { data: membership, error: memError } = await supabase
      .from('org_users')
      .select('*')
      .eq('user_id', userId)
      .eq('org_id', orgId);
    
    if (memError) throw memError;
    if (membership.length === 0) {
      console.log(`   ❌ User NOT in org_users for this org`);
    } else {
      console.log(`   ✅ User IS a member (role: ${membership[0].role})`);
    }

    // Test 3: Check if calls table has data
    console.log(`\n3. Querying calls table (for enrichment):`)
    const { data: calls, error: callsError } = await supabase
      .from('calls')
      .select('*')
      .limit(2);
    
    if (callsError && callsError.message !== 'RLS policy') {
      console.log(`   Error: ${callsError.message}`);
    } else {
      console.log(`   ✅ calls table accessible, sample:`, JSON.stringify(calls?.[0] || 'empty', null, 2).substring(0, 200));
    }

    process.exit(0);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

test();
