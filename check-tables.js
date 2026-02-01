require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkTables() {
  console.log('=== CHECKING EXISTING TABLES ===');

  // Try to query each table we need
  const tablesToCheck = [
    'organizations',
    'phone_numbers',
    'team_members',
    'support_tickets',
    'support_ticket_messages',
    'phone_number_requests',
    'billing_packages',
    'org_packages',
    'call_reports',
    'call_recordings',
    'integration_sync_jobs'
  ];

  for (const table of tablesToCheck) {
    try {
      const result = await supabase.from(table).select('*').limit(1);
      console.log(`${table}: ${result.error ? '❌ MISSING' : '✅ EXISTS'}`);
    } catch (error) {
      console.log(`${table}: ❌ ERROR - ${error.message}`);
    }
  }

  console.log('\n=== TABLES THAT NEED TO BE CREATED ===');
  console.log('Missing tables will be created now...');
}

checkTables().catch(console.error);