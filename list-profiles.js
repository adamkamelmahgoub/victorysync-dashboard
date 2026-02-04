const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
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
