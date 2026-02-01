import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkTables() {
  const tables = ['org_members', 'org_users', 'phone_numbers', 'profiles', 'organizations'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error && error.code === 'PGRST205') {
        console.log(`${table}: DOES NOT EXIST`);
      } else if (error) {
        console.log(`${table}: EXISTS but error - ${error.message}`);
      } else {
        console.log(`${table}: EXISTS`);
      }
    } catch (e) {
      console.log(`${table}: ERROR - ${(e as any).message}`);
    }
  }
}

checkTables().catch(console.error);