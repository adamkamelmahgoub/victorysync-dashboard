const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const dotenv = require('dotenv');

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

if (!API_KEY || !USER_KEY) {
  console.error('MIGHTYCALL_API_KEY or MIGHTYCALL_USER_KEY missing in server/.env');
  process.exit(1);
}

async function getToken() {
  const url = `${BASE_URL}/auth/token`;
  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', API_KEY);
  body.append('client_secret', USER_KEY);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const text = await res.text();
    if (!res.ok) {
      console.error('[auth] token request failed', res.status, text.slice(0,1000));
      return null;
    }
    try { const j = JSON.parse(text); return j.access_token || j.token || null; } catch (e) { console.error('[auth] parse failed', text); return null; }
  } catch (e) { console.error('[auth] fetch error', e); return null; }
}

async function tryEndpoints(token) {
  const endpoints = [
    '/calls', '/api/calls', '/v4/calls', '/api/calls/list', '/calls/list', '/journal/requests'
  ];
  for (const ep of endpoints) {
    try {
      const url = `${BASE_URL}${ep}`;
      let params = '';
      if (ep.includes('journal')) params = '?from=2026-01-01&to=2026-02-01&type=Call&pageSize=50&page=1';
      else params = '?startUtc=2026-01-01&endUtc=2026-02-01&pageSize=50';
      const full = `${url}${params}`;
      console.log('\nTrying', full);
      const res = await fetch(full, { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'x-api-key': API_KEY, Accept: 'application/json' }, timeout: 15000 });
      console.log('Status', res.status);
      const text = await res.text();
      console.log('Body snippet:', text.substring(0,1000));
      if (res.ok) {
        try {
          const json = JSON.parse(text || 'null');
          const list = json?.data?.calls ?? json?.calls ?? json?.requests ?? json?.data ?? [];
          console.log('Parsed entries:', Array.isArray(list) ? list.length : 'non-array');
          if (Array.isArray(list) && list.length > 0) {
            console.log('Sample 1:', JSON.stringify(list[0], null, 2).substring(0,1000));
            return { endpoint: ep, items: list };
          }
        } catch (e) {
          console.log('Parse error, got body length', text.length);
        }
      }
    } catch (e) { console.warn('Endpoint attempt failed', ep, e?.message ?? e); }
  }
  return null;
}

(async () => {
  console.log('MightyCall base URL:', BASE_URL);
  const token = await getToken();
  if (!token) { console.error('Failed to obtain token'); process.exit(2); }
  console.log('Got token (length)', token.length);
  const result = await tryEndpoints(token);
  if (!result) { console.error('No endpoints returned data'); process.exit(3); }
  console.log('\nSUCCESS: fetched from', result.endpoint, 'count:', Array.isArray(result.items) ? result.items.length : 'unknown');
})();
