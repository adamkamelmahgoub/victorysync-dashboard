# VictorySync Dashboard — Testing & Validation Guide

## Pre-Deployment Testing Checklist

### Phase 1: Unit & Integration Tests

#### 1.1 Run Smoke Tests (All Endpoints)
```bash
node scripts/smoke-test.js
```

**Expected Output:**
```
✓ Server health check
✓ Org creation
✓ User addition
✓ Org list
✓ Org details
✓ Integration creation
✓ Integration list
✓ User profile
✓ Metrics
✓ All tests passed (10/10)
```

**If tests fail:**
1. Check server is running: `npm run dev` in `server/` directory
2. Check Supabase credentials in `.env`
3. Check database migration applied: `npx supabase db push`
4. Review error messages and fix issues

---

#### 1.2 Run RLS Verification Tests
```bash
node scripts/verify-rls.js
```

**Expected Output:**
```
Testing RLS enforcement...
✓ Profiles isolation: PASS
✓ Org members isolation: PASS
✓ Phone numbers isolation: PASS
✓ MightyCall reports isolation: PASS
All RLS tests passed!
```

**If RLS tests fail:**
1. Review Supabase RLS policies (Database > Policies)
2. Verify `is_org_member()` and `is_platform_admin()` functions exist
3. Check migration was applied: `npx supabase db list` (should show migration)
4. Run migration again if needed: `npx supabase db reset`

---

### Phase 2: Manual Browser Testing

#### 2.1 Authentication Flow
1. **Open** `http://localhost:5173`
2. **Click** "Sign In" or "Sign Up"
3. **Create account** with email/password (or use test account)
4. **Verify** you see organization list (should have at least 1 org)
5. **Check** AuthContext: Open DevTools Console and run:
   ```javascript
   localStorage.getItem('auth.user') // Should show your user
   ```

**Expected Result:** ✅ Successfully logged in, org list populated

---

#### 2.2 Organization Switching
1. **In Dashboard**, click org dropdown (AdminTopNav)
2. **Select different org** from list
3. **Verify** selectedOrgId changed (DevTools Console):
   ```javascript
   sessionStorage.getItem('selectedOrgId')
   ```
4. **Verify** dashboard metrics updated for new org
5. **Refresh page** and verify org selection persists

**Expected Result:** ✅ Org switcher works, metrics update, selection persists

---

#### 2.3 Phone Numbers Page
1. **Navigate** to Numbers page
2. **Verify** phone numbers list loads
3. **Click** "Sync Phone Numbers" button (admin only)
4. **Check** sync status in toast/alert
5. **Wait** 30 seconds, refresh page
6. **Verify** new phone numbers appear (if any synced)

**Expected Result:** ✅ List loads, sync triggers, new numbers appear

---

#### 2.4 MightyCall Integrations (Admin Only)
1. **Navigate** to Admin > Integrations (or /admin/mightycall)
2. **Verify** org selector shows (if platform admin)
3. **Enter** MightyCall credentials:
   - API Key: `test-api-key-12345`
   - User Key: `test-user-key-67890`
   - Base URL: `https://api.mightycall.com`
4. **Click** "Save Integration"
5. **Verify** success message
6. **Verify** integration appears in list
7. **Click** "Delete" on integration
8. **Verify** integration removed from list

**Expected Result:** ✅ Credentials saved, deleted, list updates

---

#### 2.5 Dashboard Metrics
1. **Go** to Dashboard page
2. **Verify** KPI tiles load:
   - Calls Today
   - Calls This Month
   - SMS Today
   - Queue Status
3. **Verify** charts load:
   - Calls Over Time
   - Queue Status Chart
4. **Verify** activity feed shows recent activity
5. **Switch org** and verify metrics change

**Expected Result:** ✅ All metrics load and update with org selection

---

### Phase 3: Admin Panel Testing

#### 3.1 Organizations (Platform Admin Only)
1. **Login** with platform admin account
2. **Go** to Admin > Organizations
3. **Click** "Create Org"
4. **Enter** organization name
5. **Click** "Create"
6. **Verify** new org appears in list
7. **Click** org in list
8. **Verify** org details page loads

**Expected Result:** ✅ Can create and view organizations

---

#### 3.2 User Management (Org Admin)
1. **Go** to Admin > Team (or org members page)
2. **Verify** current members list loads
3. **Click** "Add Member"
4. **Enter** email and select role
5. **Click** "Add"
6. **Verify** member appears in list
7. **Select** member and change role
8. **Verify** role updated

**Expected Result:** ✅ Can add and manage members

---

#### 3.3 Org Settings (Org Admin)
1. **Go** to Settings page
2. **Modify** organization name
3. **Change** timezone
4. **Click** "Save"
5. **Verify** settings updated
6. **Navigate away** and back
7. **Verify** changes persisted

**Expected Result:** ✅ Can update org settings

---

### Phase 4: Data Isolation Testing (Security)

#### 4.1 Cross-Org Data Access (Should Fail)
1. **Create two test user accounts**
2. **User A:** Join Org 1
3. **User B:** Join Org 2
4. **User A:** Note a phone number ID from Org 1
5. **User B:** Try to access that phone number (open DevTools):
   ```javascript
   fetch('/api/orgs/org-1-id/phone-numbers').then(r => r.json())
   ```
6. **Verify** 403 Forbidden error (cannot access other org's data)

**Expected Result:** ✅ RLS blocks cross-org access

---

#### 4.2 Platform Admin Global Access
1. **Login** as platform admin
2. **Verify** can see all organizations
3. **Verify** can select any org
4. **Verify** can see all users
5. **Verify** can create API keys

**Expected Result:** ✅ Platform admin has global access

---

### Phase 5: API Testing (Postman or cURL)

#### 5.1 Get User Profile
```bash
curl -X GET http://localhost:4000/api/user/profile \
  -H "Authorization: Bearer <your-jwt-token>"
```

**Expected Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "global_role": "user" | "platform_admin"
}
```

---

#### 5.2 Get User Orgs
```bash
curl -X GET http://localhost:4000/api/user/orgs \
  -H "Authorization: Bearer <your-jwt-token>"
```

**Expected Response (200 OK):**
```json
[
  {
    "id": "org-uuid",
    "name": "My Org",
    "role": "org_admin" | "agent"
  }
]
```

---

#### 5.3 Create Integration
```bash
curl -X POST http://localhost:4000/api/admin/orgs/org-uuid/integrations \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "integration_type": "mightycall",
    "label": "Test Integration",
    "credentials": {
      "api_key": "test-key",
      "user_key": "test-user",
      "base_url": "https://api.mightycall.com"
    }
  }'
```

**Expected Response (200 OK):**
```json
{
  "id": "integration-uuid",
  "integration_type": "mightycall",
  "label": "Test Integration",
  "status": "active"
}
```

---

#### 5.4 Get Phone Numbers
```bash
curl -X GET "http://localhost:4000/api/orgs/org-uuid/phone-numbers?limit=10" \
  -H "Authorization: Bearer <your-jwt-token>"
```

**Expected Response (200 OK):**
```json
{
  "data": [
    {
      "id": "phone-uuid",
      "number": "+12125551234",
      "status": "active"
    }
  ],
  "total": 5
}
```

---

### Phase 6: Error Handling Testing

#### 6.1 Invalid Token
```bash
curl -X GET http://localhost:4000/api/user/profile \
  -H "Authorization: Bearer invalid-token"
```

**Expected:** 401 Unauthorized

---

#### 6.2 Insufficient Permissions
```bash
# As regular user, try to create org
curl -X POST http://localhost:4000/api/admin/orgs \
  -H "Authorization: Bearer <regular-user-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Org"}'
```

**Expected:** 403 Forbidden

---

#### 6.3 Resource Not Found
```bash
curl -X GET http://localhost:4000/api/orgs/nonexistent-uuid/phone-numbers \
  -H "Authorization: Bearer <your-token>"
```

**Expected:** 404 Not Found

---

### Phase 7: Load Testing

#### 7.1 Concurrent Users
Use Apache Bench or similar:
```bash
ab -n 100 -c 10 http://localhost:4000/api/user/profile
```

**Expected:** No errors, response time < 500ms

---

#### 7.2 Large Data Sets
```bash
# Test with org having 1000+ phone numbers
curl -X GET "http://localhost:4000/api/orgs/org-uuid/phone-numbers?limit=500" \
  -H "Authorization: Bearer <your-token>"
```

**Expected:** Response time < 2s, proper pagination

---

### Phase 8: Browser Compatibility Testing

Test in each browser:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Android)

**Test Cases:**
1. Login
2. View dashboard
3. Switch orgs
4. View phone numbers
5. Save MightyCall credentials
6. View admin panel

**Expected:** All functions work, no console errors

---

## Automated Testing Scripts

### Create Custom Test Script
Create `scripts/test-integration.js`:

```javascript
const API_URL = 'http://localhost:4000';

async function testIntegration() {
  // Get test auth token (setup required)
  const token = process.env.TEST_AUTH_TOKEN;
  
  console.log('Testing complete integration flow...');
  
  // 1. Get profile
  const profile = await fetch(`${API_URL}/api/user/profile`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  console.log('✓ Profile:', profile.email);
  
  // 2. Get orgs
  const orgs = await fetch(`${API_URL}/api/user/orgs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  console.log('✓ Orgs:', orgs.length);
  
  // 3. Get phone numbers
  if (orgs.length > 0) {
    const phones = await fetch(`${API_URL}/api/orgs/${orgs[0].id}/phone-numbers`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    console.log('✓ Phone numbers:', phones.total);
  }
  
  console.log('\n✓ All integration tests passed!');
}

testIntegration().catch(err => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
```

Run with:
```bash
TEST_AUTH_TOKEN=<your-token> node scripts/test-integration.js
```

---

## Performance Benchmarking

### Measure API Response Times
```bash
# Get average response time for profile endpoint
for i in {1..10}; do
  time curl -s http://localhost:4000/api/user/profile \
    -H "Authorization: Bearer <token>" > /dev/null
done
```

**Target:** < 100ms per request

---

## Monitoring Checklist

Before production deployment:

- [ ] Error tracking configured (Sentry, etc.)
- [ ] Performance monitoring enabled (New Relic, DataDog)
- [ ] Uptime monitoring active (Pingdom, UptimeRobot)
- [ ] Log aggregation set up (CloudWatch, ELK)
- [ ] Alerts configured for:
  - Server errors (500+)
  - Slow responses (> 1s)
  - High database load
  - RLS policy violations
- [ ] Database backups automated (daily)
- [ ] Disaster recovery plan documented

---

## Post-Deployment Validation

After deploying to production:

1. **Run smoke tests against production:**
   ```bash
   VITE_API_BASE_URL=https://api.yourdomain.com node scripts/smoke-test.js
   ```

2. **Monitor error rates** (should be < 0.1%)

3. **Monitor response times** (should be < 500ms p95)

4. **Test from multiple locations** (check CDN distribution)

5. **Verify backups** working (attempt restore)

6. **Load test** (simulate expected daily traffic)

7. **Security scan** (OWASP ZAP, Snyk)

---

## Rollback Procedure

If production issues:

1. **Immediate:** Switch traffic to previous version
2. **Database:** Restore from backup if data corruption
3. **Communications:** Notify users of incident
4. **Investigation:** Review logs and fix issues
5. **Testing:** Re-test thoroughly before re-deploying

---

## Known Issues & Workarounds

### Issue: "RLS policy violation"
**Cause:** User not in org_members table  
**Fix:** Call POST `/api/user/onboard` endpoint

### Issue: MightyCall sync timeout
**Cause:** Large data set or slow API  
**Fix:** Increase sync timeout in server config

### Issue: Phone numbers not syncing
**Cause:** Invalid MightyCall credentials  
**Fix:** Verify credentials in org_integrations table

---

**Last Updated:** February 1, 2026
