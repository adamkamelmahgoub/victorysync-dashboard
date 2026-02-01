import 'dotenv/config';
import { supabaseAdmin } from './src/lib/supabaseClient';

async function checkData() {
  try {
    console.log('Checking database data...');

    const { data: profiles, error: pErr } = await supabaseAdmin.from('profiles').select('id, email');
    if (pErr) console.error('Profiles error:', pErr);
    else console.log('Profiles:', profiles);

    const { data: orgs, error: oErr } = await supabaseAdmin.from('organizations').select('id, name');
    if (oErr) console.error('Organizations error:', oErr);
    else console.log('Organizations:', orgs);

    const { data: members, error: mErr } = await supabaseAdmin.from('org_members').select('*');
    if (mErr) console.error('Org members error:', mErr);
    else console.log('Org members:', members);

  } catch (e) {
    console.error('Error:', e);
  }
}

checkData();