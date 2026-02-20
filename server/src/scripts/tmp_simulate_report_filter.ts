import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
const normalize=(v:any)=>String(v||'').replace(/\D/g,'');
const extract=(r:any)=>{const arr=[r?.phone_number,r?.from_number,r?.to_number,r?.data?.phone_number,...(Array.isArray(r?.data?.sample_numbers)?r.data.sample_numbers:[])].map((x:any)=>String(x||'').trim()).filter(Boolean); return Array.from(new Set(arr));};
const visible=(r:any,ids:Set<string>,nums:Set<string>,digits:Set<string>)=>{const pid=String(r?.phone_number_id||''); if(pid&&ids.has(pid)) return true; const c=extract(r); if(c.length===0) return false; for(const x of c){ if(nums.has(x)) return true; const d=normalize(x); if(d&&digits.has(d)) return true;} return false;};
(async()=>{ const s=getSupabaseAdminClient(); const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9'; const uid='e5c7ac77-bddd-468a-b1ff-847c49c3a2bc';
const {data:a}=await s.from('user_phone_assignments').select('phone_number_id').eq('org_id',org).eq('user_id',uid); const ids=(a||[]).map((x:any)=>String(x.phone_number_id||'')).filter(Boolean);
let phoneList:any[]=[]; const {data:p}=await s.from('phone_numbers').select('id,number').in('id', ids.length?ids:['00000000-0000-0000-0000-000000000000']); phoneList=(p||[]) as any[];
if(phoneList.length<ids.length){ const {data:opn}=await s.from('org_phone_numbers').select('id,phone_number_id,phone_number').eq('org_id',org); const set=new Set(phoneList.map((x:any)=>String(x.id))); for(const id of ids){ if(set.has(id)) continue; const row:any=(opn||[]).find((r:any)=>String(r.phone_number_id||'')===id||String(r.id||'')===id); if(row?.phone_number){ phoneList.push({id:String(row.phone_number_id||row.id), number:String(row.phone_number)}); set.add(String(row.phone_number_id||row.id)); } }}
const idSet=new Set(phoneList.map((x:any)=>String(x.id))); const numSet=new Set(phoneList.map((x:any)=>String(x.number||'').trim()).filter(Boolean)); const digitSet=new Set(Array.from(numSet).map(normalize).filter(Boolean));
const {data:reports,error}=await s.from('mightycall_reports').select('*').eq('org_id',org).eq('report_type','calls').order('report_date',{ascending:false}).limit(500);
if(error){console.log('err',error.message); process.exit(0);} const rows=(reports||[]).filter((r:any)=>visible(r,idSet,numSet,digitSet));
console.log('assigned phones', phoneList); console.log('total reports', (reports||[]).length, 'visible', rows.length); console.log('first visible', rows.slice(0,5).map((r:any)=>({id:r.id, date:r.report_date, sample:r?.data?.sample_numbers}))); process.exit(0);
})();
