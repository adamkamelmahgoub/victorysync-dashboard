#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function checkSchema() {
  console.log('🔍 Checking database schema...\n');

  try {
    // Get actual columns from mightycall_recordings
    console.log('📋 Columns in mightycall_recordings:');
    const { data, error } = await supabase
      .from('mightycall_recordings')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      if (data.length > 0) {
        const columns = Object.keys(data[0]);
        columns.forEach(col => {
          console.log(`  - ${col}`);
        });
        
        console.log('\n📝 Sample record (first 500 chars):');
        console.log(JSON.stringify(data[0], null, 2).substring(0, 500));
      }
    }

    // Check org_users columns
    console.log('\n\n📋 Columns in org_users:');
    const { data: users, error: userError } = await supabase
      .from('org_users')
      .select('*')
      .limit(1);
    
    if (userError) {
      console.error('Error:', userError.message);
    } else {
      if (users.length > 0) {
        const columns = Object.keys(users[0]);
        columns.forEach(col => {
          console.log(`  - ${col}`);
        });
        
        console.log('\n📝 Sample record:');
        console.log(JSON.stringify(users[0], null, 2));
      }
    }

    // Get UUID of first user
    console.log('\n\n👤 Getting a real user UUID from org_users:');
    const { data: firstUser } = await supabase
      .from('org_users')
      .select('user_id, org_id')
      .limit(1);
    
    if (firstUser && firstUser.length > 0) {
      console.log(`✅ First user ID: ${firstUser[0].user_id}`);
      console.log(`✅ Their org ID: ${firstUser[0].org_id}`);
      console.log('\nYou should use this UUID, not "test@test.com", for API tests!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

checkSchema();
