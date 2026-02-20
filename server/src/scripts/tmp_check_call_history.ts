import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
(async()=>{const s=getSupabaseAdminClient(); const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
const {data,error,count}=await s.from('call_history').select('*',{count:'exact'}).eq('org_id',org).limit(3);
console.log('err', error?.message || null, 'count', count, 'sample', data);
process.exit(0);})();
