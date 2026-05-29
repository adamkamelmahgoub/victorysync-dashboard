const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE'
);

(async () => {
  // Check all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, global_role')
    .limit(10);
  
  console.log('Profiles:');
  (profiles || []).forEach(p => {
    console.log(`  ${p.id.slice(0, 8)}... - ${p.global_role}`);
  });

  // Check which profile is the test client
  const CLIENT_ID = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8';
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', CLIENT_ID);
  
  console.log('\nClient profile search:', clientProfile?.length || 0);
  if (clientProfile && clientProfile.length > 0) {
    console.log(clientProfile[0]);
  }

  process.exit(0);
})();
