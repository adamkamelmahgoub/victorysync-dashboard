const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);
(async () => {
  const { data, error } = await supabase.from('org_phone_numbers').select('*').eq('org_id', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
  console.log('Rows for VictorySync:', data?.length || 0);
  if (error) console.log('Error:', error.message);
  if (data && data.length > 0) console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
