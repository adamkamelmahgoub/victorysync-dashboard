import '../config/env';
import { getMightyCallAccessToken, fetchMightyCallReports, fetchMightyCallRecordings } from '../integrations/mightycall';

async function main() {
  try {
    const token = await getMightyCallAccessToken();
    console.log('[test] got token:', !!token);

    const start = '2026-01-25';
    const end = '2026-02-01';
    console.log('[test] fetching reports...');
    const reports = await fetchMightyCallReports(token, [], start, end);
    console.log('[test] reports count:', reports.length);
    console.log(JSON.stringify((reports || []).slice(0,3), null, 2));

    console.log('[test] fetching recordings...');
    const recs = await fetchMightyCallRecordings(token, [], start, end);
    console.log('[test] recordings count:', recs.length);
    console.log(JSON.stringify((recs || []).slice(0,3), null, 2));

    process.exit(0);
  } catch (err) {
    console.error('[test] error', err);
    process.exit(1);
  }
}

main();
