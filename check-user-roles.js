const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE'
);

(async () => {
  const CLIENT_ID = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8';
  const ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  console.log('Checking client profile...');
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', CLIENT_ID)
    .single();
  
  console.log('Client profile:', clientProfile);

  console.log('\nChecking admin profile...');
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', ADMIN_ID)
    .single();
  
  console.log('Admin profile:', adminProfile);

  console.log('\nChecking org_users for client...');
  const { data: clientOrgUsers } = await supabase
    .from('org_users')
    .select('*')
    .eq('user_id', CLIENT_ID)
    .eq('org_id', ORG);
  
  console.log('Client org_users:', clientOrgUsers?.length || 0, clientOrgUsers);

  console.log('\nChecking org_users for admin...');
  const { data: adminOrgUsers } = await supabase
    .from('org_users')
    .select('*')
    .eq('user_id', ADMIN_ID)
    .eq('org_id', ORG);
  
  console.log('Admin org_users:', adminOrgUsers?.length || 0, adminOrgUsers);
})();
