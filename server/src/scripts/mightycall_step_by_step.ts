import fetch from 'node-fetch';
import { MIGHTYCALL_BASE_URL, MIGHTYCALL_API_KEY, MIGHTYCALL_USER_KEY } from '../config/env';

function buildUrlVariants(baseUrl: string, endpoint: string) {
  const base = (baseUrl || '').replace(/\/$/, '');
  const ep = endpoint || '';
  return [`${base}${ep}`, `${base}/api${ep}`];
}

async function tryAuth(): Promise<string | null> {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const endpoint = '/auth/token';
  const candidates = buildUrlVariants(base, endpoint);
  const clientId = MIGHTYCALL_API_KEY || '';
  const clientSecret = MIGHTYCALL_USER_KEY || '';

  for (const url of candidates) {
    try {
      const body = new URLSearchParams();
      body.append('grant_type', 'client_credentials');
      body.append('client_id', clientId);
      body.append('client_secret', clientSecret);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-key': MIGHTYCALL_API_KEY || '' },
        body: body.toString(),
      });

      const text = await res.text();
      console.log('[step-by-step] AUTH', url, 'status', res.status);
      console.log('[step-by-step] AUTH body snippet:', text.substring(0, 4000));

      if (!res.ok) continue;
      let json: any = null;
      try { json = JSON.parse(text || 'null'); } catch (e) { continue; }
      const token = json?.access_token || json?.token || null;
      if (token) return token;
    } catch (e:any) {
      console.warn('[step-by-step] auth error', e?.message ?? String(e));
      continue;
    }
  }
  return null;
}

async function tryGet(path: string, token: string | null, params?: Record<string,string>) {
  const base = (MIGHTYCALL_BASE_URL || '').replace(/\/$/, '');
  const candidates = buildUrlVariants(base, path);
  let last: { url: string; status?: number; body?: string } | null = null;
  for (const c of candidates) {
    try {
      const url = params ? `${c}?${new URLSearchParams(params).toString()}` : c;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-api-key': MIGHTYCALL_API_KEY || '',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const text = await res.text();
      console.log('[step-by-step] GET', url, 'status', res.status);
      console.log('[step-by-step] body snippet:', text.substring(0, 4000));

      if (res.ok) return { url, status: res.status, body: text };

      // Not OK — record and try next candidate (404s are expected for wrong prefix)
      last = { url, status: res.status, body: text };
      continue;
    } catch (e:any) {
      console.warn('[step-by-step] GET error for', c, e?.message ?? String(e));
      last = { url: c, status: undefined, body: String(e?.message ?? String(e)) };
      continue;
    }
  }
  return last;
}

async function main() {
  console.log('--- MightyCall Step-by-Step Debug (per docs) ---');

  const token = await tryAuth();
  if (!token) {
    console.error('Auth failed: no token obtained. Check MIGHTYCALL_API_KEY and MIGHTYCALL_USER_KEY.');
    return process.exitCode = 2;
  }

  // 1) phonenumbers
  await tryGet('/phonenumbers', token);

  // 2) calls (use requested range 2025-08-01 -> today)
  const start = '2025-08-01';
  const end = new Date().toISOString().split('T')[0];
  await tryGet('/calls', token, { startUtc: start, endUtc: end, pageSize: '1000', skip: '0' });

  // 3) journal/requests
  const from = `${start}T00:00:00Z`;
  const to = `${new Date().toISOString()}`;
  await tryGet('/journal/requests', token, { from, to, type: 'Call', pageSize: '1000', page: '1' });

  console.log('--- debug complete ---');
}

main().catch(e => { console.error('Fatal error', e); process.exitCode = 1; });
