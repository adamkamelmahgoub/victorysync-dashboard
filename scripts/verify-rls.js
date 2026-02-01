// scripts/verify-rls.js
/**
 * RLS Verification Script
 * Tests that Row-Level Security policies are correctly enforced.
 * Run with: node scripts/verify-rls.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbW84ZXN2amVsYWljaHlyZHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk0NzI0MDcsImV4cCI6MTc2MTA0ODQwN30.DmLVdZ2i4gRLRnHpS5sGu-DslX7t2hNMfFq1m1LkFWQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('\n=== RLS Verification Tests ===\n');
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      console.log(`Testing: ${t.name}`);
      await t.fn();
      console.log('  ✓ PASS\n');
      passed++;
    } catch (err) {
      console.log(`  ✗ FAIL: ${err.message}\n`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Test 1: profiles table — anon user cannot read other users' profiles
test('profiles: anon user cannot read other users profiles', async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('user_id', supabase.auth.user?.id);
  
  if (error) {
    throw new Error(`RLS should block: ${error.message}`);
  }
  if (data && data.length > 0) {
    throw new Error('RLS should have returned empty result');
  }
});

// Test 2: org_members table — anon user cannot read other orgs' members
test('org_members: anon user cannot read orgs they are not in', async () => {
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single();
  
  if (orgErr) {
    console.log('  (skip: no orgs available)');
    return;
  }

  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', org.id);
  
  if (!error) {
    throw new Error('RLS should block access to org members');
  }
});

// Test 3: phone_numbers table — anon user cannot see unassigned numbers
test('phone_numbers: anon user cannot access unassigned phone numbers', async () => {
  const { data, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .limit(1);
  
  if (!error && data && data.length > 0) {
    throw new Error('RLS should block access to unassigned phone numbers');
  }
});

// Test 4: mightycall_reports — anon user cannot read other orgs reports
test('mightycall_reports: anon user cannot read other orgs reports', async () => {
  const { data, error } = await supabase
    .from('mightycall_reports')
    .select('*')
    .limit(1);
  
  if (!error && data && data.length > 0) {
    throw new Error('RLS should block access to other org reports');
  }
});

runTests();
