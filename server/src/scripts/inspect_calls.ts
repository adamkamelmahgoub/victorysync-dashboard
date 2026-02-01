import '../config/env';
import { getMightyCallAccessToken, fetchMightyCallCalls } from '../integrations/mightycall';

async function main(){
  const token = await getMightyCallAccessToken();
  console.log('got token');
  const calls = await fetchMightyCallCalls(token, {dateStart: '2026-01-25', dateEnd: '2026-02-01', limit: 10});
  console.log('calls.length', calls.length);
  console.log(JSON.stringify((calls||[]).slice(0,5), null, 2));
}
main().catch(e=>{console.error(e); process.exit(1)});
