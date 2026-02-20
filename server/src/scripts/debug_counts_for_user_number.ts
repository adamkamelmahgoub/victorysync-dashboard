import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';

(async () => {
  const s = getSupabaseAdminClient();
  const org = 'b8d8f5d4-1977-46b4-acc8-06f2fc985dc9';
  const assignedId = '15a44a46-4605-43ad-8234-fa62f29ec30a';

  const { data: op } = await s.from('org_phone_numbers').select('id,phone_number_id,phone_number').eq('org_id', org);
  const row = (op || []).find((r: any) => String(r.phone_number_id) === assignedId || String(r.id) === assignedId);
  console.log('matched_org_phone_row', row || null);

  const num = String((row as any)?.phone_number || '').trim();
  const d = normalizePhoneDigits(num) || '';
  console.log('number', num, 'digits', d);

  const callOr = [
    `from_number.eq.${num}`,
    `to_number.eq.${num}`,
    `from_number_digits.eq.${d}`,
    `to_number_digits.eq.${d}`,
  ].join(',');
  const { count: callCount, error: cErr } = await s
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org)
    .or(callOr);
  console.log('calls_count', callCount || 0, 'err', cErr?.message || null);

  const recOr = [`from_number.eq.${num}`, `to_number.eq.${num}`].join(',');
  const { count: recCount, error: rErr } = await s
    .from('mightycall_recordings')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org)
    .or(recOr);
  console.log('recordings_count', recCount || 0, 'err', rErr?.message || null);

  const smsOr = [`from_number.eq.${num}`, `to_number.eq.${num}`].join(',');
  const { count: smsCount, error: sErr } = await s
    .from('mightycall_sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org)
    .or(smsOr);
  console.log('sms_count', smsCount || 0, 'err', sErr?.message || null);

  process.exit(0);
})();
