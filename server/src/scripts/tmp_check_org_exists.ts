import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
(async()=>{const s=getSupabaseAdminClient(); const id='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9'; const {data,error}=await s.from('organizations').select('id,name').eq('id',id).maybeSingle(); console.log('org',data,'err',error?.message||null); process.exit(0);})();
