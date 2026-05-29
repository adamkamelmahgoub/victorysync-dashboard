const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);
(async () => {
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const { data, error } = await supabase
    .from('org_phone_numbers')
    .select('*')
    .eq('org_id', orgId);
  console.log('Rows for VictorySync:', data?.length || 0);
  if (data && data.length > 0) console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
