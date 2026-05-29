const { createClient } = require('@supabase/supabase-js');

async function check() {
  try {
    const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE');
    
    // Try to get auth users via admin endpoint
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.log('Auth error:', error.message);
    } else {
      console.log(`Found ${users?.length || 0} auth users`);
      users?.slice(0, 5).forEach(u => console.log(`  - ${u.email}`));
    }
    
    // Check org_members table
    const { data: members } = await supabase.from('org_members').select('*').limit(5);
    console.log(`\nOrg members: ${members?.length || 0}`);
    members?.forEach(m => console.log(`  - User: ${m.user_id}, Org: ${m.org_id}, Role: ${m.role}`));
    
    // Check organizations
    const { data: orgs } = await supabase.from('organizations').select('*');
    console.log(`\nOrganizations: ${orgs?.length || 0}`);
    orgs?.forEach(o => console.log(`  - ${o.name} (${o.id})`));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
