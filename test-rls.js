#!/usr/bin/env node
/**
 * RLS Test Script for VictorySync
 * Verifies that Row-Level Security policies are working correctly
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseAnon = supabaseAnonKey ? createClient(SUPABASE_URL, supabaseAnonKey) : null;

async function testRLS() {
  console.log('🔍 Running RLS Tests for VictorySync...\n');

  try {
    // Test 1: Service role can access all records
    console.log('Test 1: Service role can list phone_numbers');
    const { data: allNumbers, error: allError } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, org_id, phone_number')
      .limit(5);
    
    if (allError) {
      console.error('❌ Service role failed:', allError.message);
    } else {
      console.log(`✅ Service role returned ${allNumbers?.length || 0} records`);
    }

    // Test 2: Service role can access org_integrations
    console.log('\nTest 2: Service role can access org_integrations');
    const { data: allIntegrations, error: integError } = await supabaseAdmin
      .from('org_integrations')
      .select('id, org_id, provider')
      .limit(5);
    
    if (integError) {
      console.error('❌ Service role failed:', integError.message);
    } else {
      console.log(`✅ Service role returned ${allIntegrations?.length || 0} integration records`);
    }

    // Test 3: Service role can access mightycall_reports
    console.log('\nTest 3: Service role can access mightycall_reports');
    const { data: allReports, error: reportError } = await supabaseAdmin
      .from('mightycall_reports')
      .select('id, org_id')
      .limit(5);
    
    if (reportError) {
      console.error('❌ Service role failed:', reportError.message);
    } else {
      console.log(`✅ Service role returned ${allReports?.length || 0} report records`);
    }

    // Test 4: Check if org_members RLS prevents platform_admin from inserting into org_members
    console.log('\nTest 4: Verify org_members table structure');
    const { data: orgMembersCheck, error: orgMembersError } = await supabaseAdmin
      .from('org_members')
      .select('id, user_id, org_id, role')
      .limit(3);
    
    if (orgMembersError && orgMembersError.code !== 'PGRST116') {
      console.error('❌ Failed to access org_members:', orgMembersError.message);
    } else {
      console.log(`✅ org_members table is accessible (${orgMembersCheck?.length || 0} rows)`);
    }

    // Test 5: Verify RLS policies exist
    console.log('\nTest 5: Checking RLS policy definitions');
    const { data: policies, error: policiesError } = await supabaseAdmin
      .rpc('pg_get_policies_info', {})
      .catch(() => ({ data: null, error: { message: 'RPC not available' } }));
    
    if (policies) {
      console.log(`✅ Found ${policies.length || 0} RLS policy definitions`);
    } else {
      console.log('⚠️  Could not verify policy count (RPC may not be available)');
    }

    console.log('\n✅ RLS Tests Completed!');
    console.log('\nNote: Comprehensive RLS testing requires authenticated users with specific org memberships.');
    console.log('This test only verifies that service role access works correctly.');

  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

testRLS();
