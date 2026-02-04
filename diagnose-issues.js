/**
 * Diagnosis script for client visibility, playback, and filtering issues
 */

const API_BASE = 'http://localhost:4000';
const TEST_ORG_ID = 'TEST_ORG';
const TEST_USER_ID = 'test-user-123';

async function test(name, fn) {
  try {
    console.log(`\n📝 ${name}...`);
    await fn();
    console.log(`✅ ${name} - OK`);
  } catch (e) {
    console.error(`❌ ${name} - FAILED:`, e.message);
  }
}

async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'x-user-id': TEST_USER_ID,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  console.log('🔍 VictorySync Diagnosis Report\n');
  
  // Test 1: Check if recordings endpoint returns data for clients
  await test('GET /api/recordings for client (org member)', async () => {
    const data = await apiCall('GET', `/api/recordings?org_id=${TEST_ORG_ID}&limit=5`);
    console.log(`  - Returned ${data.recordings?.length || 0} recordings`);
    
    if (data.recordings?.length > 0) {
      const r = data.recordings[0];
      console.log(`  - First recording:`, {
        id: r.id,
        from: r.from_number,
        to: r.to_number,
        duration: r.duration || r.duration_seconds,
        date: r.recording_date,
        has_url: !!r.recording_url
      });
    }
  });
  
  // Test 2: Try to download/play a recording
  await test('GET /api/recordings/:id/download', async () => {
    const recordings = await apiCall('GET', `/api/recordings?org_id=${TEST_ORG_ID}&limit=1`);
    if (recordings.recordings?.length > 0) {
      const recordingId = recordings.recordings[0].id;
      console.log(`  - Attempting download for ID: ${recordingId}`);
      
      const opts = {
        headers: { 'x-user-id': TEST_USER_ID }
      };
      const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/download`, opts);
      console.log(`  - Response status: ${res.status}`);
      console.log(`  - Response headers:`, {
        'content-type': res.headers.get('content-type'),
        'content-disposition': res.headers.get('content-disposition'),
        'content-length': res.headers.get('content-length')
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`Download failed: ${JSON.stringify(errData)}`);
      }
    }
  });
  
  // Test 3: Check org-assigned phone numbers
  await test('GET /api/orgs/:orgId/phone-numbers', async () => {
    const data = await apiCall('GET', `/api/orgs/${TEST_ORG_ID}/phone-numbers`);
    console.log(`  - Org has ${data.phones?.length || 0} assigned phone numbers`);
    if (data.phones?.length > 0) {
      console.log(`  - First phone:`, data.phones[0]);
    }
  });
  
  // Test 4: Check if recordings are filtered by phone when client has assigned phones
  await test('Recordings with phone filtering', async () => {
    const data = await apiCall('GET', `/api/recordings?org_id=${TEST_ORG_ID}&phone=+17323286846`);
    console.log(`  - Returned ${data.recordings?.length || 0} recordings for specific phone`);
  });
  
  // Test 5: Check org details
  await test('GET /api/admin/orgs/:orgId', async () => {
    const data = await apiCall('GET', `/api/admin/orgs/${TEST_ORG_ID}`);
    console.log(`  - Org: ${data.id}`);
    console.log(`  - Name: ${data.name}`);
    console.log(`  - Members: ${data.org_members?.length || 0}`);
    console.log(`  - Assigned phones: ${data.org_phone_numbers?.length || 0}`);
  });
  
  console.log('\n✨ Diagnosis complete!');
})();
