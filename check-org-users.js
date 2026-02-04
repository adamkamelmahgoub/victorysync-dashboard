const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const CLIENT_ID = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8';
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  // Check org_users
  const { data: orgUsers } = await supabase
    .from('org_users')
    .select('*')
    .eq('org_id', ORG);
  
  console.log('All org_users in org:', orgUsers?.length || 0);
  if (orgUsers) {
    orgUsers.forEach(u => {
      console.log(`  ${u.user_id.slice(0, 8)}... - ${u.role} - is_client=${u.is_client}`);
      if (u.user_id === CLIENT_ID) {
        console.log('  ^^ This is our client user!');
      }
    });
  }

  // Check if client is in org
  const { data: clientInOrg } = await supabase
    .from('org_users')
    .select('*')
    .eq('user_id', CLIENT_ID)
    .eq('org_id', ORG);
  
  console.log('\nClient in org_users:', clientInOrg?.length || 0);
  if (clientInOrg && clientInOrg.length > 0) {
    console.log(clientInOrg[0]);
  }

  process.exit(0);
})();
