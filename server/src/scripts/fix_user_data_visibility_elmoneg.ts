import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { syncMightyCallReports, syncMightyCallCallHistory, syncMightyCallRecordings, syncMightyCallSMS } from '../integrations/mightycall';

(async()=>{
 const s=getSupabaseAdminClient();
 const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
 const user='e5c7ac77-bddd-468a-b1ff-847c49c3a2bc';
 const fallback='+12122357403';
 const start='2026-01-01';
 const end='2026-02-19';

 let phoneId:string|null=null;
 const {data: phExact}=await s.from('phone_numbers').select('id,number').eq('org_id',org).eq('number',fallback).maybeSingle();
 if(phExact) phoneId=phExact.id;
 if(!phoneId){
  const {data: created, error: cErr}=await s.from('phone_numbers').insert({org_id:org, external_id:`manual-default-${org}-${fallback.replace(/\D/g,'')}`, number:fallback, label:'Default Assigned Number', is_active:true, metadata:{source:'manual_fix'}}).select('id,number').maybeSingle();
  if(cErr){ console.log('create phone err', cErr.message); }
  if(created) phoneId=created.id;
 }
 if(phoneId){
   await s.from('org_phone_numbers').upsert({org_id:org, phone_number_id:phoneId, phone_number:fallback, is_active:true, label:'Default Assigned Number', created_at:new Date().toISOString()}, { onConflict: 'org_id,phone_number_id' as any });
   await s.from('user_phone_assignments').upsert({org_id:org, user_id:user, phone_number_id:phoneId, created_at:new Date().toISOString()}, { onConflict: 'org_id,user_id,phone_number_id' as any });
 }

 const {data: orgPhones}=await s.from('org_phone_numbers').select('phone_number_id, phone_number').eq('org_id',org);
 const ids=(orgPhones||[]).map((r:any)=>r.phone_number_id).filter(Boolean);
 console.log('org phones for sync', orgPhones);

 const rr=await syncMightyCallReports(s, org, ids, start, end);
 const cc=await syncMightyCallCallHistory(s, org, {dateStart:start, dateEnd:end});
 const rec=await syncMightyCallRecordings(s, org, ids, start, end);
 const sm=await syncMightyCallSMS(s, org);
 console.log('sync results', { rr, cc, rec, sm });

 const {count: callsCount}=await s.from('calls').select('id',{count:'exact', head:true}).eq('org_id',org);
 const {count: repCount}=await s.from('mightycall_reports').select('id',{count:'exact', head:true}).eq('org_id',org);
 const {count: recCount}=await s.from('mightycall_recordings').select('id',{count:'exact', head:true}).eq('org_id',org);
 const {count: smsCount}=await s.from('mightycall_sms_messages').select('id',{count:'exact', head:true}).eq('org_id',org);
 console.log('post counts', { callsCount: callsCount||0, repCount: repCount||0, recCount: recCount||0, smsCount: smsCount||0 });

 process.exit(0);
})();
