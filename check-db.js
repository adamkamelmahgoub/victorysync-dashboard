const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkTables() {
  console.log('Checking database tables and data...\n');

  // Check org_members count
  try {
    const { data, error } = await supabase.from('org_members').select('*', { count: 'exact' });
    if (error) {
      console.log('❌ org_members query error:', error.message);
    } else {
      console.log(`✅ org_members table: ${data.length} records`);
      if (data.length > 0) {
        console.log('Sample org_members record:', JSON.stringify(data[0], null, 2));
      }
    }
  } catch (e) {
    console.log('❌ org_members error:', e.message);
  }

  // Check org_users count
  try {
    const { data, error } = await supabase.from('org_users').select('*', { count: 'exact' });
    if (error) {
      console.log('❌ org_users query error:', error.message);
    } else {
      console.log(`✅ org_users table: ${data.length} records`);
      if (data.length > 0) {
        console.log('Sample org_users record:', JSON.stringify(data[0], null, 2));
      }
    }
  } catch (e) {
    console.log('❌ org_users error:', e.message);
  }

  // Check organizations count
  try {
    const { data, error } = await supabase.from('organizations').select('*', { count: 'exact' });
    if (error) {
      console.log('❌ organizations query error:', error.message);
    } else {
      console.log(`✅ organizations table: ${data.length} records`);
      if (data.length > 0) {
        console.log('Sample organization:', JSON.stringify(data[0], null, 2));
      }
    }
  } catch (e) {
    console.log('❌ organizations error:', e.message);
  }

  // Check RLS functions
  console.log('\nChecking RLS functions...');
  try {
    const { data, error } = await supabase.rpc('is_org_member', { org_id: '00000000-0000-0000-0000-000000000000' });
    if (error) {
      console.log('❌ is_org_member function error:', error.message);
    } else {
      console.log('✅ is_org_member function exists');
    }
  } catch (e) {
    console.log('❌ is_org_member function error:', e.message);
  }
}

checkTables().catch(console.error);