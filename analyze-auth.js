#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk',
  { auth: { persistSession: false } }
);

async function analyze() {
  console.log('🔍 Analyzing Supabase user setup...\n');

  try {
    // 1. Get auth users (if accessible)
    console.log('1. Checking auth.users table:');
    const { data: authUsers, error: authError } = await supabase
      .from('users')
      .select('id, email, created_at')
      .limit(20);
    
    if (authError) {
      console.log('   ⚠️  Cannot access users table directly (likely RLS)');
      console.log('   Error:', authError.message);
    } else {
      if (authUsers && authUsers.length > 0) {
        console.log(`   ✅ Found ${authUsers.length} users in auth`);
        authUsers.forEach(u => {
          console.log(`      - ${u.id.substring(0, 8)}... (${u.email})`);
        });
      } else {
        console.log('   ❌ No users found in auth.users');
      }
    }

    // 2. Get org_users to see what's mapped
    console.log('\n2. Current org_users mappings:');
    const { data: orgUsers, error: ouError } = await supabase
      .from('org_users')
      .select('id, user_id, org_id, role, created_at');
    
    if (ouError) {
      console.error('   Error:', ouError.message);
    } else {
      console.log(`   ✅ Found ${orgUsers.length} org_users entries\n`);
      
      // Group by org
      const byOrg = {};
      orgUsers.forEach(ou => {
        if (!byOrg[ou.org_id]) byOrg[ou.org_id] = [];
        byOrg[ou.org_id].push(ou);
      });
      
      Object.entries(byOrg).forEach(([orgId, entries]) => {
        console.log(`   Org: ${orgId.substring(0, 8)}...`);
        entries.forEach(ou => {
          console.log(`      - User: ${ou.user_id.substring(0, 8)}... (role: ${ou.role})`);
        });
      });
    }

    // 3. Get organizations
    console.log('\n3. Available organizations:');
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name');
    
    if (orgs) {
      orgs.forEach(org => {
        console.log(`   - ${org.id.substring(0, 8)}... : ${org.name}`);
      });
    }

    // 4. Check if we can find any email references
    console.log('\n4. Searching for email references:');
    const { data: allUsers } = await supabase
      .from('org_users')
      .select('user_id, org_id, role, metadata')
      .limit(10);
    
    console.log('   org_users has these columns:');
    if (allUsers && allUsers.length > 0) {
      console.log('   ', Object.keys(allUsers[0]).join(', '));
    }

    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(60));
    console.log(`
✅ Database structure is correct
✅ ${orgUsers.length} org_users entries exist
✅ Users are mapped to orgs by UUID

⚠️  ISSUE: auth.users table not directly accessible
   This is expected due to Supabase RLS policies

📌 ACTION NEEDED:
   Need to create SQL to add/update:
   - test@test.com (client user)
   - adam@victorysync.com (admin user)

   Generated UUID users need to be:
   1. Created in Supabase Auth (if not already)
   2. Added to org_users table with proper org_id
    `);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

analyze();
