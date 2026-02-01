/**
 * FIXES FOR SYNC AND PHONE NUMBERS ENDPOINTS
 * 
 * Issues to fix:
 * 1. Frontend calls GET /api/orgs/:orgId/phone-numbers but endpoint doesn't exist
 * 2. Reports and recordings sync returning 0 - need to debug MightyCall API calls
 * 3. Phone number sync endpoint may have auth/permission issues
 */

// FIX 1: Add missing GET /api/orgs/:orgId/phone-numbers endpoint
// This should be added after app.get('/api/admin/phone-numbers', ...) around line 938

const getOrgPhoneNumbersEndpoint = `
app.get('/api/orgs/:orgId/phone-numbers', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actorId = req.header('x-user-id') || null;

    // Org members can view their org's phone numbers
    if (actorId) {
      const isMember = await isOrgMember(actorId, orgId);
      if (!isMember && !(await isPlatformAdmin(actorId))) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Get phones assigned to this org
    const { data: orgPhones, error } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('phone_number_id')
      .eq('org_id', orgId);

    if (error) throw error;

    if (!orgPhones || orgPhones.length === 0) {
      return res.json({ phone_numbers: [], numbers: [] });
    }

    const phoneIds = orgPhones.map(op => op.phone_number_id).filter(Boolean);

    // Get phone details
    const { data: phones, error: phoneErr } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, number, label, number_digits, e164, created_at, updated_at')
      .in('id', phoneIds);

    if (phoneErr) throw phoneErr;

    res.json({
      phone_numbers: phones || [],
      numbers: phones || []
    });
  } catch (err: any) {
    console.error('[get_org_phone_numbers] error:', fmtErr(err));
    res.status(500).json({ error: 'fetch_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});
`;

// FIX 2: The phone number sync issue
// The frontend calls triggerMightyCallPhoneNumberSync which calls /api/mightycall/sync/phone-numbers
// The backend endpoint exists but may not be dev-bypass friendly
// Need to ensure x-dev-bypass: true works for this endpoint

// FIX 3: Reports and recordings sync returning 0
// The issue is likely in fetchMightyCallReports and fetchMightyCallRecordings
// These functions may be getting errors from the API but returning empty arrays silently
// We need to:
// a) Check if MightyCall API is actually being called correctly
// b) Verify phone numbers are being passed correctly
// c) Check date formats
// d) Log more debugging info

const reportsSyncDebugFix = `
// In server/src/integrations/mightycall.ts, update fetchMightyCallReports:

export async function fetchMightyCallReports(accessToken: string, phoneNumberIds: string[], startDate: string, endDate: string): Promise<any[]> {
  const baseUrl = (MIGHTYCALL_BASE_URL || '').replace(/\\/$/, '');
  const url = \`\${baseUrl}/journal/requests\`;

  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('from', startDate);
    params.append('to', endDate);
    params.append('type', 'Call');
    params.append('pageSize', '1000');
    params.append('page', '1');

    console.log('[MightyCall fetchReports] Calling:', url, 'with params:', {
      from: startDate,
      to: endDate,
      type: 'Call',
      pageSize: '1000'
    });

    const res = await requestWithRetry(\`\${url}?\${params.toString()}\`, {
      method: 'GET',
      headers: {
        Authorization: \`Bearer \${accessToken}\`,
        'x-api-key': MIGHTYCALL_API_KEY || '',
        Accept: 'application/json',
      },
    }, 2, 300);

    if (res.status === 404) {
      console.error('[MightyCall] Journal requests endpoint not found (404)');
      return [];
    }

    const text = await res.text();
    console.log('[MightyCall fetchReports] Response status:', res.status, 'body length:', text.length);

    if (!res.ok) {
      console.warn('[MightyCall] Journal requests failed', { status: res.status, body: text.substring(0, 500) });
      return [];
    }

    let json: any = null;
    try {
      json = JSON.parse(text || 'null');
    } catch (e) {
      console.warn('[MightyCall] Journal requests parse failed:', e);
      return [];
    }

    // Journal API returns { currentPage, requests: [...] }
    const list = json?.requests ?? json?.data?.requests ?? [];
    if (!Array.isArray(list)) {
      console.warn('[MightyCall] unexpected journal response shape', { keys: Object.keys(json || {}), body: JSON.stringify(json).substring(0, 200) });
      return [];
    }

    console.log(\`[MightyCall] successfully fetched \${list.length} journal entries for reports\`);
    return list as any[];
  } catch (err: any) {
    console.error('[MightyCall] Journal requests endpoint error', err?.message ?? String(err));
    return [];
  }
}
`;

console.log(getOrgPhoneNumbersEndpoint);
console.log(reportsSyncDebugFix);

export { getOrgPhoneNumbersEndpoint, reportsSyncDebugFix };
