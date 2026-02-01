require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const userId = 'e0720727-872b-47d3-8e0b-b1345686311d';
    const orgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
    
    // Check org_users table
    const { data: orgUsers, error: orgUsersErr } = await supabase
      .from('org_users')
      .select('*')
      .eq('user_id', userId);
    
    if (orgUsersErr) throw orgUsersErr;
    
    console.log('org_users records:', orgUsers);
    
    // Check organizations table
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();
    
    if (orgErr && orgErr.code !== 'PGRST116') throw orgErr;
    
    console.log('Organization:', org);
    
    // If no org_users record, create one
    if (!orgUsers || orgUsers.length === 0) {
      console.log('\nCreating org_users record...');
      const { data, error } = await supabase
        .from('org_users')
        .insert([{ user_id: userId, org_id: orgId, role: 'org_admin' }])
        .select();
      
      if (error) throw error;
      console.log('✓ Created org_users record:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
