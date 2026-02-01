import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function test() {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('organizations').select('count').limit(1);
    console.log('Connection test result:', { data, error });
  } catch (e) {
    console.error('Connection error:', (e as any).message);
  }
}

test().catch(console.error);