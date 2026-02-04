const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const CLIENT_ID = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8';
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  console.log('Checking phone assignments for client...');
  
  const { data: assignments, error: assignErr } = await supabase
    .from('user_phone_assignments')
    .select('*')
    .eq('user_id', CLIENT_ID)
    .eq('org_id', ORG);

  console.log('Assignments:', assignments?.length || 0, 'error:', assignErr);
  if (assignments && assignments.length > 0) {
    console.log(JSON.stringify(assignments, null, 2));
  }

  // Check all users in this org
  console.log('\nAll users in this org:');
  const { data: orgUsers } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('org_id', ORG);
  
  console.log('User count:', orgUsers?.length || 0);
  if (orgUsers) {
    orgUsers.slice(0, 3).forEach(u => {
      console.log(`  ${u.id.slice(0, 8)}... - ${u.email} (${u.role})`);
    });
  }
})();
