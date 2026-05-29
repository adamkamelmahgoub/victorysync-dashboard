const { createClient } = require('@supabase/supabase-js');

async function check() {
  try {
    const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE');
    
    // Check users
    const { data: users } = await supabase.from('platform_users').select('id,email,global_role').limit(10);
    console.log('\n=== Platform Users ===');
    users?.forEach(u => console.log(`  - ${u.email}: ${u.global_role}`));
    
    // Check phone assignments for the test user
    const testUserId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
    const { data: assignments } = await supabase
      .from('phone_number_client_assignments')
      .select('*')
      .eq('client_user_id', testUserId);
    
    console.log(`\n=== Phone assignments for user (${testUserId}) ===`);
    if (assignments && assignments.length > 0) {
      console.log(`Found ${assignments.length} assignment(s):`);
      assignments.forEach(a => console.log(`  - Phone ID: ${a.phone_number_id}`));
    } else {
      console.log('No assignments found');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
