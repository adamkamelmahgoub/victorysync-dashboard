require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw usersErr;
    
    console.log('All users:', users?.map(u => ({ id: u.id.substring(0, 8), email: u.email })));
    
    // Set adam@victorysync.com as platform admin via user metadata
    const adminUser = users?.find(u => u.email === 'adam@victorysync.com');
    if (!adminUser) {
      console.log('No admin user found');
      return;
    }
    
    console.log('Found admin user:', adminUser.id, adminUser.email);
    
    // Update user metadata to set global_role
    const { data, error } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      { user_metadata: { ...adminUser.user_metadata, global_role: 'admin' } }
    );
    
    if (error) throw error;
    console.log('✓ Updated user metadata:', data.user?.user_metadata);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
