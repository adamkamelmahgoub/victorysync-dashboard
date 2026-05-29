const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);

(async () => {
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const { data: orgPhones, error: err } = await supabase
    .from('org_phone_numbers')
    .select('*')
    .eq('org_id', orgId);
  
  console.log('VictorySync org org_phone_numbers:');
  if (err) {
    console.log('Error:', err.message);
  } else {
    console.log('Total rows:', orgPhones.length);
    if (orgPhones.length > 0) console.log(JSON.stringify(orgPhones, null, 2));
  }
  process.exit(0);
})();
