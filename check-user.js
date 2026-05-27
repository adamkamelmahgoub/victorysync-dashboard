const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE'
);

async function check() {
  console.log('Checking users table...\n');
  
  const { data: allUsers, error: e1 } = await sb.from('users').select('*');
  if (e1) {
    console.log('Error fetching all users:', e1);
  } else {
    console.log('All users in table:', JSON.stringify(allUsers, null, 2));
  }
  
  console.log('\n---\n');
  
  const { data: testUser, error: e2 } = await sb
    .from('users')
    .select('*')
    .eq('id', 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a')
    .single();
  
  if (e2) {
    console.log('Error fetching test user:', e2);
  } else {
    console.log('Test user:', JSON.stringify(testUser, null, 2));
  }
}

check();
