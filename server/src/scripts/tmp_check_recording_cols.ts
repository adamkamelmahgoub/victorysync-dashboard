import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
(async()=>{const s=getSupabaseAdminClient(); const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
const {data,error,count}=await s.from('mightycall_recordings').select('*',{count:'exact'}).eq('org_id',org).limit(1);
console.log('err', error?.message || null, 'count', count, 'row', data?.[0]);
process.exit(0);})();
