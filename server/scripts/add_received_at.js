require('dotenv').config();
const pg = require('pg');
(async ()=>{
  try{
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    if(!supabaseUrl || !supabaseServiceKey){ console.error('Missing env'); process.exit(1); }
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    const client = new pg.Client({ host: projectId + '.supabase.co', port: 5432, database: 'postgres', user: 'postgres', password: supabaseServiceKey, ssl: { rejectUnauthorized: false } });
    console.log('[add_received_at] connecting...');
    await client.connect();
    await client.query("ALTER TABLE IF EXISTS public.mightycall_sms_messages ADD COLUMN IF NOT EXISTS received_at timestamptz;");
    console.log('[add_received_at] ALTER executed');
    await client.end();
    process.exit(0);
  }catch(e){ console.error('ERROR', e && e.message); process.exit(1); }
})();
