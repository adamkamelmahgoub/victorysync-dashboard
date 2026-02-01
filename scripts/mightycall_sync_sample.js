const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '..', 'server', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('.env not found at', envPath);
  process.exit(1);
}

const API_KEY = process.env.MIGHTYCALL_API_KEY;
const USER_KEY = process.env.MIGHTYCALL_USER_KEY;
const BASE_URL = (process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4').replace(/\/+$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!API_KEY || !USER_KEY) { console.error('MIGHTYCALL keys missing'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Supabase settings missing'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ORG_ID = process.env.TEST_ORG_ID || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

async function getToken() {
  const url = `${BASE_URL}/auth/token`;
  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', API_KEY);
  body.append('client_secret', USER_KEY);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const text = await res.text();
  if (!res.ok) { console.error('auth failed', res.status, text); return null; }
  try { const j = JSON.parse(text); return j.access_token || j.token || null; } catch (e) { console.error('auth parse failed', text); return null; }
}

async function fetchCalls(token) {
  const url = `${BASE_URL}/api/calls?startUtc=2026-01-01&endUtc=2026-02-01&pageSize=50`;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'x-api-key': API_KEY, Accept: 'application/json' } });
  if (!res.ok) { console.error('calls fetch failed', res.status); return []; }
  const json = await res.json();
  return json?.data?.calls ?? json?.calls ?? [];
}

(async () => {
  console.log('Starting sync sample...');
  const token = await getToken();
  if (!token) { console.error('No token'); process.exit(2); }
  console.log('Token OK');
  const calls = await fetchCalls(token);
  console.log('Calls fetched:', calls.length);
  const rows = [];
  for (const c of calls) {
    const rec = c.callRecord || c.call_record || null;
    const recordingUrl = rec?.uri || rec?.fileName || null;
    if (!recordingUrl) continue;
      rows.push({ org_id: ORG_ID, phone_number_id: null, call_id: c.id || c.callId || null, recording_url: recordingUrl, duration_seconds: c.duration ? parseInt(c.duration,10) : null, recording_date: c.dateTimeUtc || null, metadata: c });
    if (rows.length >= 5) break;
  }

  if (rows.length === 0) { console.log('No recordings found to sync'); process.exit(0); }

  try {
      // Ensure corresponding call rows exist so foreign key constraints are satisfied
      const callRows = rows.map(r => {
        const c = calls.find(x => (x.id || x.callId) === r.call_id);
        return {
          id: r.call_id,
          org_id: ORG_ID,
          from_number: c?.caller?.phone || (c?.from ?? null),
          to_number: c?.businessNumber || (c?.called && c.called[0] && c.called[0].phone) || null,
          started_at: r.recording_date || new Date().toISOString(),
          ended_at: r.recording_date || new Date().toISOString(),
          duration_seconds: r.duration_seconds || null,
          status: (c?.callStatus || c?.status || '').toString()
        };
      });

      const { data: insertedCalls, error: callsErr } = await supabase.from('calls').insert(callRows).select();
      if (callsErr) {
        console.error('Insert calls error:', callsErr);
        // continue — if calls already exist this may fail; ignore and proceed to recordings insert
      } else {
        console.log('Inserted call rows:', insertedCalls?.length || 0);
      }
    const { data, error } = await supabase.from('mightycall_recordings').insert(rows).select();
    if (error) { console.error('Insert error:', error); process.exit(3); }
    console.log('Inserted rows:', data?.length ?? rows.length);
    console.log('Sample persisted row:', JSON.stringify(data?.[0] || rows[0], null, 2).substring(0,1000));
  } catch (e) { console.error('Sync exception', e); process.exit(4); }
})();
