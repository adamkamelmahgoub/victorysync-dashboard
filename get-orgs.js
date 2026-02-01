require('dotenv').config({path: './server/.env'});
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id,name')
      .limit(3);
    
    if (error) throw error;
    
    console.log('Available organizations:');
    data.forEach(org => console.log(`  ${org.id} - ${org.name}`));
    if (data.length > 0) {
      console.log(`\nUse org_id: ${data[0].id}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
