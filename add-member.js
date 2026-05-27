const { createClient } = require('@supabase/supabase-js');

async function addMember() {
  const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE');
  
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
