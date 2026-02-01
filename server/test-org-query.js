require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const userId = 'e0720727-872b-47d3-8e0b-b1345686311d';
    
    console.log('Testing org_users query with admin key...');
    const { data, error } = await supabase
      .from('org_users')
      .select('org_id, user_id, role')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('✓ Query successful:', data);
    }
    
    if (data) {
      console.log('\nFetching organization details...');
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', data.org_id)
        .single();
      
      if (orgErr) {
        console.error('Org Error:', orgErr.message);
      } else {
        console.log('✓ Organization:', org);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
