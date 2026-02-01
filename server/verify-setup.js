require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Get all users and their status
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw usersErr;
    
    const adamUser = users?.find(u => u.email === 'adam@victorysync.com');
    const clientUser = users?.find(u => u.email === 'kimo8723@aol.com');
    
    console.log('✓ Setup verification:');
    console.log('\nAdmin User (adam@victorysync.com):');
    console.log('  - global_role:', adamUser?.user_metadata?.global_role);
    console.log('  - org_id:', adamUser?.user_metadata?.org_id);
    
    console.log('\nClient User (kimo8723@aol.com):');
    console.log('  - org_id:', clientUser?.user_metadata?.org_id);
    console.log('  - role:', clientUser?.user_metadata?.role);
    
    // Check org_users for client
    const { data: clientOrgUsers, error: clientOrgErr } = await supabase
      .from('org_users')
      .select('*')
      .eq('user_id', clientUser?.id);
    
    if (!clientOrgErr) {
      console.log('  - org_users records:', clientOrgUsers?.length || 0);
    }
    
    console.log('\n✓ Setup complete! Ready to test.');
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
