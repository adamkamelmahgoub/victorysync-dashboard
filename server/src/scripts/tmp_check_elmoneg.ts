import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

const norm = (v: any) => String(v || '').replace(/\D/g, '');
(async()=>{
  const s = getSupabaseAdminClient();
  const userId = 'e5c7ac77-bddd-468a-b1ff-847c49c3a2bc';
  const orgId = 'b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
  const { data: a } = await s.from('user_phone_assignments').select('phone_number_id').eq('org_id', orgId).eq('user_id', userId);
  const ids = (a||[]).map((r:any)=>String(r.phone_number_id||'')).filter(Boolean);
  console.log('assignment ids', ids);
  const { data: p } = await s.from('phone_numbers').select('id,number,label').in('id', ids.length?ids:['00000000-0000-0000-0000-000000000000']);
  const phoneList: any[] = (p||[]).map((r:any)=>({id:String(r.id), number:String(r.number||''), label:r.label||null}));
  if (phoneList.length < ids.length) {
    const { data: opn } = await s.from('org_phone_numbers').select('id,phone_number_id,phone_number,label').eq('org_id', orgId);
    const byId = new Set(phoneList.map((x:any)=>x.id));
    for (const id of ids) {
      if (byId.has(id)) continue;
      const row:any = (opn||[]).find((r:any)=>String(r.phone_number_id||'')===id || String(r.id||'')===id);
      if (row && row.phone_number) {
        phoneList.push({ id: String(row.phone_number_id||row.id), number: String(row.phone_number), label: row.label||null });
        byId.add(String(row.phone_number_id||row.id));
      }
    }
  }
  const numbers = Array.from(new Set(phoneList.map((x:any)=>String(x.number||'').trim()).filter(Boolean)));
  const digits = Array.from(new Set(numbers.map(norm).filter(Boolean)));
  console.log('resolved phones', phoneList);
  console.log('numbers', numbers, 'digits', digits);

  const mkOr = () => {
    const parts:string[] = [];
    for (const n of numbers) { parts.push(`from_number.eq.${n.replace(/,/g,'\\,')}`); parts.push(`to_number.eq.${n.replace(/,/g,'\\,')}`); }
    for (const d of digits) { parts.push(`from_number.ilike.*${d}*`); parts.push(`to_number.ilike.*${d}*`); }
    return parts.join(',');
  };
  const or = mkOr();

  const smsQ = s.from('mightycall_sms_messages').select('id,from_number,to_number,created_at',{count:'exact'}).eq('org_id', orgId).order('created_at',{ascending:false}).limit(10);
  const sms = or ? await smsQ.or(or) : await smsQ;
  console.log('sms count', sms.count, 'sample', sms.data?.slice(0,3));

  const recQ = s.from('mightycall_recordings').select('id,from_number,to_number,recording_date,duration_seconds',{count:'exact'}).eq('org_id', orgId).order('recording_date',{ascending:false}).limit(10);
  const rec = or ? await recQ.or(or) : await recQ;
  console.log('recordings count', rec.count, 'sample', rec.data?.slice(0,3));

  const callQ = s.from('calls').select('id,from_number,to_number,started_at,status',{count:'exact'}).eq('org_id', orgId).order('started_at',{ascending:false}).limit(10);
  const calls = or ? await callQ.or(or) : await callQ;
  console.log('calls count', calls.count, 'sample', calls.data?.slice(0,3));

  const rep = await s.from('mightycall_reports').select('id,phone_number,report_date,data',{count:'exact'}).eq('org_id',orgId).order('report_date',{ascending:false}).limit(10);
  console.log('reports count', rep.count, 'sample numbers', (rep.data||[]).map((r:any)=>r.phone_number).slice(0,10));

  process.exit(0);
})();
