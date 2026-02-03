import { config } from 'dotenv';
config();
import { getMightyCallAccessToken, fetchMightyCallCalls, fetchMightyCallRecordings, fetchMightyCallSMS, fetchMightyCallJournalRequests } from '../integrations/mightycall';

async function debug() {
  console.log('[DEBUG] Testing MightyCall API responses for August 2025 - Feb 2026...\n');
  
  const token = await getMightyCallAccessToken();
  const startDate = '2025-08-01';
  const endDate = '2026-02-02';
  
  console.log('[1] Testing fetchMightyCallCalls...');
  const calls = await fetchMightyCallCalls(token, {
    startUtc: `${startDate}T00:00:00Z`,
    endUtc: `${endDate}T23:59:59Z`,
    pageSize: '1000'
  });
  console.log(`   Returned: ${calls.length} calls`);
  if (calls.length > 0) {
    console.log(`   Sample: ${JSON.stringify(calls[0]).substring(0, 100)}...`);
  }
  
  console.log('\n[2] Testing fetchMightyCallRecordings...');
  const recordings = await fetchMightyCallRecordings(token, [], startDate, endDate);
  console.log(`   Returned: ${recordings.length} recordings`);
  if (recordings.length > 0) {
    console.log(`   Sample: ${JSON.stringify(recordings[0]).substring(0, 100)}...`);
  }
  
  console.log('\n[3] Testing fetchMightyCallJournalRequests for SMS (type=Message)...');
  const sms = await fetchMightyCallJournalRequests(token, {
    from: `${startDate}T00:00:00Z`,
    to: `${endDate}T23:59:59Z`,
    type: 'Message',
    pageSize: '1000',
    page: '1'
  });
  console.log(`   Returned: ${sms.length} SMS messages`);
  if (sms.length > 0) {
    console.log(`   Sample: ${JSON.stringify(sms[0]).substring(0, 100)}...`);
  }
  
  console.log('\n[4] Testing fetchMightyCallSMS...');
  const smsAlt = await fetchMightyCallSMS(token);
  console.log(`   Returned: ${smsAlt.length} SMS messages`);
}

debug().catch(e => console.error('[ERROR]', e));
