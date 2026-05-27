const { createClient } = require('@supabase/supabase-js');

async function check() {
  try {
    const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE');
    
    const orgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'; // From test endpoint
    
    // Check org
    const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single();
    console.log('Org:', org?.name || 'unknown');
    
    // Get phone numbers for this org
    const { data: phones } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('org_id', orgId);
    
    console.log(`\nPhone numbers (${phones?.length || 0}):`);
    phones?.forEach(p => console.log(`  - ${p.id}: ${p.number}`));
    
    // Get members of this org
    const { data: members } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId);
    
    console.log(`\nOrg members (${members?.length || 0}):`);
    
    if (members && members.length > 0) {
      for (const member of members.slice(0, 3)) {
        const { data: user } = await supabase.from('platform_users').select('email,global_role').eq('id', member.user_id).single();
        console.log(`  - ${member.user_id}: ${user?.email || 'unknown'} (${user?.global_role || 'no role'})`);
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
