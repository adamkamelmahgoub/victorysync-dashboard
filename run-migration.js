require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('=== RUNNING MASTER MIGRATION ===');

  try {
    // Read the migration file
    const migrationSQL = fs.readFileSync('./supabase/MASTER_MIGRATION.sql', 'utf8');

    // Split into individual statements (basic approach)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          const result = await supabase.rpc('exec_sql', { sql: statement });
          if (result.error) {
            console.log(`❌ Error in statement ${i + 1}:`, result.error.message);
            // Continue with other statements
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`);
          }
        } catch (error) {
          console.log(`❌ Error executing statement ${i + 1}:`, error.message);
          // Continue with other statements
        }
      }
    }

    console.log('\n=== MIGRATION ATTEMPT COMPLETE ===');
    console.log('Note: Some statements may have failed due to Supabase limitations.');
    console.log('Please run the MASTER_MIGRATION.sql file manually in Supabase SQL Editor for complete setup.');

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration().catch(console.error);