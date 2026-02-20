import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

(async()=>{
 const s=getSupabaseAdminClient();
 const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
 const {data: calls, error}=await s.from('calls').select('to_number,from_number').eq('org_id',org).limit(5000);
 if(error){console.log('calls error',error.message); process.exit(0);} 
 console.log('calls rows', (calls||[]).length);
 const map=new Map<string,number>();
 for(const c of calls||[]){
  const a=String((c as any).to_number||'').trim(); if(a) map.set(a,(map.get(a)||0)+1);
  const b=String((c as any).from_number||'').trim(); if(b) map.set(b,(map.get(b)||0)+1);
 }
 console.log('top', Array.from(map.entries()).sort((x,y)=>y[1]-x[1]).slice(0,20));
 process.exit(0);
})();
