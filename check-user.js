const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://kwbewtfrvqfedatmxhpz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmV3dGZydnFmZWRhdG1kaHBaIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE3MDI2NzUsImV4cCI6MjA0NzI3ODY3NX0.kKALnIQrQP_L2YnKWnZLvOKk9Y6jNDT6J36YmwbdZjo'
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
