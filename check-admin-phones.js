const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE'
);

(async () => {
  const ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  console.log('Admin profile...');
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', ADMIN_ID);
  
  console.log('Admin:', profile?.[0] || 'NOT FOUND');

  console.log('\nAdmin phone assignments...');
  const { data: assignments } = await supabase
    .from('user_phone_assignments')
    .select('*')
    .eq('user_id', ADMIN_ID)
    .eq('org_id', ORG);
  
  console.log('Assignments:', assignments?.length || 0);
  if (assignments && assignments.length > 0) {
    assignments.slice(0, 2).forEach(a => console.log(' ', a));
  }

  console.log('\nAll org phone numbers...');
  const { data: phones } = await supabase
    .from('phone_numbers')
    .select('id, number, org_id')
    .eq('org_id', ORG);
  
  console.log('Phones:', phones?.length || 0);
  if (phones) {
    phones.slice(0, 3).forEach(p => console.log('  ', p.number));
  }

  process.exit(0);
})();
