const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE', { auth: { persistSession: false } });
(async () => {
  const { data } = await supabase.from('org_phone_numbers').select('*');
  console.log('All org_phone_numbers rows:', data?.length || 0);
  if (data) data.forEach(r => console.log(\  org_id: \... phone: \\));
  process.exit(0);
})();
