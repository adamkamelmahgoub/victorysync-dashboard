require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw usersErr;
    
    const clientUser = users?.find(u => u.email === 'kimo8723@aol.com');
    if (!clientUser) {
      console.log('No client user found');
      return;
    }
    
    console.log('Found client user:', clientUser.id, clientUser.email);
    console.log('Current metadata:', clientUser.user_metadata);
    
    // Make sure client has no org_id and is not an admin
    const { data, error } = await supabase.auth.admin.updateUserById(
      clientUser.id,
      { user_metadata: { ...clientUser.user_metadata, global_role: null } }
    );
    
    if (error) throw error;
    console.log('✓ Updated user metadata (removed admin role):', data.user?.user_metadata);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
