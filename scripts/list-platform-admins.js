require('dotenv').config({path: './server/.env'});
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY){console.error('Missing SUPABASE envs'); process.exit(1)}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
(async ()=>{
  const { data, error } = await supabase.from('profiles').select('id,email,global_role');
  if(error){ console.error('Error querying profiles', error); process.exit(1)}
  console.log('Profiles:');
  (data||[]).forEach(p=>console.log(p));
  process.exit(0);
})();