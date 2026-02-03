import { getMightyCallAccessToken, fetchMightyCallJournalRequests, fetchMightyCallCalls } from '../integrations/mightycall';

async function test() {
  console.log('[test] getting token...');
  const token = await getMightyCallAccessToken();
  
  console.log('[test] fetching calls 2025-08-01 to 2026-02-02...');
  const calls = await fetchMightyCallCalls(token, {
    startUtc: '2025-08-01T00:00:00Z',
    endUtc: '2026-02-02T23:59:59Z'
  });
  
  console.log(`[test] Total calls: ${Array.isArray(calls) ? calls.length : 'error'}`);
  
  if (Array.isArray(calls) && calls.length > 0) {
    console.log('[test] First 3 calls:');
    calls.slice(0, 3).forEach((c: any, i: number) => {
      console.log(`  Call ${i}: ${c.id}, status: ${c.callStatus}, dateTime: ${c.dateTimeUtc}, recordings: ${c.recordingsCount || 0}`);
    });
  }

  console.log('[test] Fetching journal requests 2025-08-01 to 2026-02-02...');
  const journal = await fetchMightyCallJournalRequests(token, {
    from: '2025-08-01T00:00:00Z',
    to: '2026-02-02T23:59:59Z',
    type: 'Call',
    pageSize: '1000',
    page: '1'
  });
  
  console.log(`[test] Total journal entries: ${Array.isArray(journal) ? journal.length : 'error'}`);
  
  if (Array.isArray(journal) && journal.length > 0) {
    console.log('[test] First 3 journal entries:');
    journal.slice(0, 3).forEach((j: any, i: number) => {
      console.log(`  Entry ${i}: ${j.id}, type: ${j.type}, state: ${j.state}, duration: ${j.duration}, created: ${j.created}`);
    });
  }
}

test().catch(e => console.error('[test] error:', e));
