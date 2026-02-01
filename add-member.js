const { createClient } = require('@supabase/supabase-js');

async function addMember() {
  const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
  
  const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const userId = '9a303c48-2343-4438-832c-7f1268781b6d';
  
  // Try org_users table (no role constraint)
  console.log('Adding to org_users (without role)...');
  const { error } = await supabase
    .from('org_users')
    .insert({
      user_id: userId,
      org_id: testOrgId
    });
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('✓ Added user to org_users');
  }
  
  process.exit(0);
}

addMember();
