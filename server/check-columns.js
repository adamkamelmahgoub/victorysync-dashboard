require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Get the information_schema to see table structure
    const { data, error } = await supabase
      .rpc('get_profiles_columns');
    
    if (error) {
      console.error('RPC error (columns):', error.message);
    } else {
      console.log('Profile columns:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
