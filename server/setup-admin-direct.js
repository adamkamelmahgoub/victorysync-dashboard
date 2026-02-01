require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Try to insert a profile row with global_role  for adam
    const { data, error } = await supabase
      .from('profiles')
      .upsert([
        {
          id: 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a',
          global_role: 'admin'
        }
      ])
      .select();
    
    if (error) {
      console.error('Upsert error:', error);
      
      // Try INSERT if column doesn't exist
      console.log('\nAttempting direct insert...');
      try {
        const { data: insertData, error: insertError } = await supabase
          .from('profiles')
          .insert([
            {
              id: 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a',
              global_role: 'admin'
            }
          ])
          .select();
        
        if (insertError) {
          console.error('Insert error:', insertError.message);
        } else {
          console.log('✓ Insert successful:', insertData);
        }
      } catch (e) {
        console.error('Insert exception:', e.message);
      }
    } else {
      console.log('✓ Upsert successful:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
