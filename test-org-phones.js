const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);

(async () => {
  const { data, error } = await supabaseAdmin
    .from('org_phone_numbers')
    .select('*')
    .eq('org_id', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
  
  console.log('org_phone_numbers for VictorySync org:');
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  process.exit(0);
})();
