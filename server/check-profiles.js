require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select()
      .limit(1);
    
    if (error) {
      console.error('Error querying profiles:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Profiles table columns:');
      console.log(Object.keys(data[0]));
    } else {
      console.log('No rows in profiles table');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
