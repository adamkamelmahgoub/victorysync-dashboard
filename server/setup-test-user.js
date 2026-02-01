require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw usersErr;
    
    const testUser = users?.find(u => u.email === 'test@test.com');
    if (!testUser) {
      console.log('No test@test.com user found');
      return;
    }
    
    console.log('Found test user:', testUser.id, testUser.email);
    console.log('Current metadata:', testUser.user_metadata);
    
    // Use the same org as the client user
    const orgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
    
    // Update user metadata to add org_id
    const { data, error } = await supabase.auth.admin.updateUserById(
      testUser.id,
      { user_metadata: { ...testUser.user_metadata, org_id: orgId, role: 'agent' } }
    );
    
    if (error) throw error;
    console.log('✓ Updated user metadata:', data.user?.user_metadata);
    
    // Check org_users table
    const { data: orgUsers, error: orgUsersErr } = await supabase
      .from('org_users')
      .select('*')
      .eq('user_id', testUser.id);
    
    if (orgUsersErr) throw orgUsersErr;
    
    console.log('\norg_users records:', orgUsers?.length || 0);
    
    if (!orgUsers || orgUsers.length === 0) {
      console.log('Creating org_users record...');
      const { data: newRecord, error: insertErr } = await supabase
        .from('org_users')
        .insert([{ user_id: testUser.id, org_id: orgId, role: 'agent' }])
        .select();
      
      if (insertErr) throw insertErr;
      console.log('✓ Created org_users record:', newRecord);
    }
    
    console.log('\n✓ test@test.com is now set up for the client dashboard!');
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
