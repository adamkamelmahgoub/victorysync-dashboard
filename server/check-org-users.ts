import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkOrgUsers() {
  const { data, error } = await supabase.from('org_users').select('*').limit(5);
  console.log('org_users data:', data);
  console.log('error:', error);
}

checkOrgUsers().catch(console.error);