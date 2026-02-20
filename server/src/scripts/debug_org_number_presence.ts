import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';

function extract(meta: any) {
  try {
    const m = typeof meta === 'string' ? JSON.parse(meta) : meta;
    if (!m || typeof m !== 'object') return { from: null as any, to: null as any };
    const from = m.from_number || m.from || m.businessNumber || m.caller_number || m.phone_number || null;
    let to = null as any;
    if (Array.isArray(m.called) && m.called[0]) to = m.called[0].phone || m.called[0].number || null;
    if (!to) to = m.to_number || m.to || m.recipient || m.destination_number || null;
    return { from, to };
  } catch { return { from: null, to: null }; }
}

(async()=>{
  const s=getSupabaseAdminClient();
  const org='b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';

  const {data: recs}=await s.from('mightycall_recordings').select('from_number,to_number,metadata').eq('org_id',org).limit(5000);
  const rMap=new Map<string,number>();
  for(const r of recs||[]){
    const p=extract((r as any).metadata);
    const from=String((r as any).from_number||p.from||'').trim();
    const to=String((r as any).to_number||p.to||'').trim();
    if(from) rMap.set(from,(rMap.get(from)||0)+1);
    if(to) rMap.set(to,(rMap.get(to)||0)+1);
  }
  console.log('top_recording_numbers', Array.from(rMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20));

  const {data: sms}=await s.from('mightycall_sms_messages').select('from_number,to_number').eq('org_id',org).limit(5000);
  const sMap=new Map<string,number>();
  for(const m of sms||[]){
    const from=String((m as any).from_number||'').trim();
    const to=String((m as any).to_number||'').trim();
    if(from) sMap.set(from,(sMap.get(from)||0)+1);
    if(to) sMap.set(to,(sMap.get(to)||0)+1);
  }
  console.log('top_sms_numbers', Array.from(sMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20));

  const assigned=['+18482161220','+17323286846','+13123194556'];
  for(const n of assigned){
    const d=normalizePhoneDigits(n)||'';
    const rc=(rMap.get(n)||0) + (rMap.get(d)||0);
    const sc=(sMap.get(n)||0) + (sMap.get(d)||0);
    console.log('assigned_presence', n, { recordings: rc, sms: sc });
  }

  process.exit(0);
})();
