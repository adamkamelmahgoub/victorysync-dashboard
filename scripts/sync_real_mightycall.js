const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '..', 'server', '.env');
if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); } else { console.error('.env not found'); process.exit(1); }

const API_KEY = process.env.MIGHTYCALL_API_KEY;
const USER_KEY = process.env.MIGHTYCALL_USER_KEY;
const BASE_URL = (process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4').replace(/\/+$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID = process.env.TEST_ORG_ID || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

if (!API_KEY || !USER_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getToken() {
  const url = `${BASE_URL}/auth/token`;
  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', API_KEY);
  body.append('client_secret', USER_KEY);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const text = await res.text();
  if (!res.ok) { console.error('auth failed', res.status); return null; }
  try { const j = JSON.parse(text); return j.access_token || j.token || null; } catch (e) { console.error('auth parse failed'); return null; }
}

async function fetchCalls(token) {
  const url = `${BASE_URL}/api/calls?startUtc=2026-01-01&endUtc=2026-02-01&pageSize=100`;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'x-api-key': API_KEY, Accept: 'application/json' } });
  if (!res.ok) { console.error('calls fetch failed', res.status); return []; }
  const json = await res.json();
  return json?.data?.calls ?? json?.calls ?? [];
}

(async () => {
  console.log('Syncing real MightyCall data...');
  const token = await getToken();
  if (!token) { console.error('No token'); process.exit(2); }
  console.log('Auth OK');
  
  const calls = await fetchCalls(token);
  console.log('Fetched', calls.length, 'calls from MightyCall');
  
  // Build calls and recordings rows
  const callRows = [];
  const recordingRows = [];
  
  for (const c of calls) {
    const callId = c.id || c.callId || null;
    if (!callId) continue;
    
    // Insert call row
    callRows.push({
      id: callId,
      org_id: ORG_ID,
      from_number: c.caller?.phone || null,
      to_number: c.businessNumber || (c.called && c.called[0] && c.called[0].phone) || null,
      started_at: c.dateTimeUtc || new Date().toISOString(),
      ended_at: c.dateTimeUtc || new Date().toISOString(),
      duration_seconds: c.duration ? parseInt(c.duration, 10) : null,
      status: c.callStatus || c.status || 'unknown'
    });
    
    // If has recording, add recording row
    if (c.callRecord && (c.callRecord.uri || c.callRecord.fileName)) {
      recordingRows.push({
        org_id: ORG_ID,
        phone_number_id: null,
        call_id: callId,
        recording_url: c.callRecord.uri || c.callRecord.fileName,
        duration_seconds: c.duration ? parseInt(c.duration, 10) : null,
        recording_date: c.dateTimeUtc || new Date().toISOString(),
        metadata: { callRecord: c.callRecord }
      });
    }
  }
  
  console.log('Calls to insert:', callRows.length);
  console.log('Recordings to insert:', recordingRows.length);
  
  // Insert calls
  if (callRows.length > 0) {
    const { data, error } = await supabase.from('calls').insert(callRows).select();
    if (error && !error.message.includes('violates unique constraint')) {
      console.error('Insert calls error:', error);
      process.exit(3);
    } else {
      console.log('Inserted calls:', data?.length || callRows.length);
    }
  }
  
  // Insert recordings
  if (recordingRows.length > 0) {
    const { data, error } = await supabase.from('mightycall_recordings').insert(recordingRows).select();
    if (error) {
      console.error('Insert recordings error:', error);
      process.exit(4);
    } else {
      console.log('Inserted recordings:', data?.length || recordingRows.length);
    }
  }
  
  console.log('SUCCESS: synced real MightyCall data into DB');
  process.exit(0);
})();
