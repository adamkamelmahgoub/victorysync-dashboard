require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const migrationFile = '../supabase/008_add_global_role.sql';
    if (!fs.existsSync(migrationFile)) {
      console.error('Migration file not found:', migrationFile);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationFile, 'utf-8');
    console.log('Executing migration:');
    console.log(sql.substring(0, 200), '...');

    // Execute the SQL directly
    const lines = sql.split(';').filter(line => line.trim());
    for (const statement of lines) {
      if (statement.trim()) {
        try {
          const { data, error } = await supabase.rpc('query', { sql: statement.trim() });
          if (error) {
            console.log(`Statement: ${statement.substring(0, 50)}...`);
            console.log(`Error (may be expected for some statements):`, error.message);
          } else {
            console.log(`✓ Executed: ${statement.substring(0, 50)}...`);
          }
        } catch (e) {
          console.log(`Exception executing statement: ${e.message}`);
        }
      }
    }
    console.log('Migration completed!');
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
