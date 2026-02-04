# How to Test the Reports Fixes

## Quick Start

### 1. Backend & Frontend Running
```bash
# Terminal 1: Backend
cd server
npm run build
node dist/index.js

# Terminal 2: Frontend  
cd client
npm run dev
```

Both should be running before testing.

## Test Scenarios

### Scenario 1: Admin Filtering Large Date Range
**Objective**: Verify that admins can filter reports from 2024 to now and see all calls (not just 1000)

**Steps**:
1. Log in as admin user
2. Navigate to Admin → Reports
3. Set Date Range: 
   - Start: 2024-01-01
   - End: 2026-12-31 (or today)
4. Select organization with data (e.g., "Test Client1")
5. Verify:
   - ✅ Call count is displayed
   - ✅ Call count is > 1000 (if data exists)
   - ✅ Statistics show accurate data (avg duration, etc.)
   - ✅ No timeout errors

**Expected Result**: Should see thousands of calls if they exist, not capped at 1000

---

### Scenario 2: Recording Durations Display
**Objective**: Verify that recordings show proper durations, not 0s

**Steps**:
1. Navigate to Recordings page
2. Look at the recording list
3. Click on any recording to view details
4. Verify:
   - ✅ Duration is shown in seconds (not 0s)
   - ✅ Duration is shown in human format (e.g., "2h 12m 30s")
   - ✅ From and To phone numbers are displayed
   - ✅ Recording date is shown

**Expected Result**: All recordings should have proper duration information displayed

---

### Scenario 3: Client Reports Access
**Objective**: Verify that client users can access reports/statistics

**Steps**:
1. Log in as a client/non-admin user
2. Navigate to Reports page
3. Verify:
   - ✅ Reports page loads without errors
   - ✅ Statistics are displayed (total calls, avg duration, etc.)
   - ✅ Call list is shown with durations
   - ✅ Date filter works

**Expected Result**: Client should see reports with calculated statistics from their data

---

## Automated Testing

### Run Diagnostic
```bash
node diagnostic-recording-quality.js
```
This will:
- Fetch all organizations
- Check recording data quality for each
- Report on duration, phone number, and date completeness
- Show sample recordings

**Expected Output**:
```
Organization: Test Client1 (...)
  📼 Found 20+ recordings
  📊 Data Quality:
     Duration: 20/20 (100%)
     Phone Numbers: 20/20 (100%)
     Dates: 20/20 (100%)
```

### Test Reports Access
```bash
node test-reports-access.js
```
This will:
- Test call-stats endpoint access
- Test recordings endpoint access
- Check user org memberships
- Report on data availability

**Expected Output**:
```
TEST 1: Admin Call Stats Access
  Status: 200
  ✅ Calls: XXXX, Data points: XXXX

TEST 3: Admin MightyCall Reports
  Status: 200
  ✅ Got N reports
```

---

## Manual API Testing

### Test Call Stats with Large Range
```bash
curl -X GET "http://localhost:4000/api/call-stats?org_id=ORG_ID&start_date=2024-01-01&end_date=2026-12-31" \
  -H "x-user-id: USER_ID"
```

**Expected Response**:
```json
{
  "stats": {
    "totalCalls": 2500,  // Should be > 1000 if data exists
    "answeredCalls": 2375,
    "avgDuration": 120,
    "dataPoints": 2500,  // New field showing data volume
    "callsWithDurationData": 2500
  },
  "calls": [...]
}
```

---

## Troubleshooting

### Issue: Still seeing 1000 calls max
**Solution**:
- Rebuild backend: `cd server && npm run build`
- Restart server: `node dist/index.js`
- Clear browser cache
- Test endpoint directly with curl

### Issue: 0-second durations still showing
**Solution**:
- Check database: Do recordings have duration_seconds?
- Trigger recording sync: `POST /api/mightycall/sync/recordings`
- Verify data sync completed successfully

### Issue: Client can't access reports
**Solution**:
- Check user-org membership
- Try navigating to /reports (not /admin/reports)
- Frontend should fallback to recordings endpoint automatically
- Check browser console for errors

---

## Key Changes to Verify

### 1. Pagination Implemented
Check in server logs for messages like:
```
[call_stats] Fetching page: offset=0, size=1000
[call_stats] Fetching page: offset=1000, size=1000
```
This shows pagination is working.

### 2. Duration Data Quality
All recordings returned by `/api/recordings` should have a `duration` field > 0 (unless recording was empty).

### 3. Fallback Mechanism
If you see this in browser console:
```
Access denied to call-stats, falling back to recordings endpoint
```
This means the fallback is working properly.

---

## Performance Notes

- Large date ranges (2+ years) may take 5-10 seconds to process
- Pagination happens server-side, so frontend response is fast
- Frontend render should be under 1 second even with 100+ records

---

## Rollback If Needed

If issues arise, the previous version is available:
```bash
git revert 5685b69
```

This will undo all changes and restore the 1000-record limit behavior.
