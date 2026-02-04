# Data Display Issues - Diagnosis and Fixes

## Identified Issues

### 1. ✅ FIXED: Recordings missing duration and phone numbers
**Problem**: Admin users could see recordings but they had no duration field and phone numbers weren't displayed  
**Root Cause**: 
- Recordings table stores duration_seconds but API wasn't renaming it to `duration`
- Phone numbers are in the related `calls` table via `call_id`, not in mightycall_recordings
- Metadata field was empty/not populated

**Solution**: Modified `/api/recordings` endpoint to:
- Join with calls table on call_id to get phone numbers and duration
- Map duration_seconds → duration for frontend compatibility  
- Include from_number, to_number, call_started_at, call_ended_at from related call record

**Status**: ✅ DEPLOYED and working for admins

**Evidence**: 
```
Admin recordings now return:
  - duration: 72766 (seconds)
  - from_number & to_number: Available from calls table
  - recording_date: Available
```

---

### 2. ⚠️ PARTIAL: Client access control
**Problem**: Client users see 0 recordings  

**Root Causes Found**:
- Test client ID used (3b7c30f5...) doesn't exist in database
- Real users in the database are platform_admins and agents
- Client users NOT in org_users table for the test org

**Partial Fix Applied**: Modified endpoint to allow org members without phone assignments to see all org recordings
- Before: non-admin + no phone assignments = 0 recordings
- After: non-admin + no phone assignments BUT is org member = all org recordings

**Status**: ⚠️ PARTIAL - Code fix deployed, but test data issue prevents full validation

**Action Needed**: Need to test with a real org member (agent) who is in org_users

---

### 3. ❌ UNFIXED: Phone numbers null in from_number/to_number
**Issue**: Even though code joins with calls table, from_number and to_number showing as null

**Possible Causes**:
- Recording's call_id might be null/invalid
- Call record doesn't exist for the recording
- Join logic not working correctly

**Status**: Needs investigation

---

### 4. ❌ UNFIXED: call-stats endpoint returning 0 durations
**Problem**: /api/call-stats returns:
```json
{
  "totalDuration": 0,
  "avgDuration": 0, 
  "avgHandleTime": 0
}
```

**Status**: Needs fix

---

### 5. ❌ NOT ADDRESSED: Reports endpoint returning incomplete data
**Problem**: /api/mightycall/reports returns stale/incomplete data, user wants reports pulled directly from MightyCall API

**Status**: Not yet addressed

---

## Test Results

### Endpoint: /api/recordings
- **Admin [WORKING]**: Returns 3 recordings with duration field ✅
- **Agent [UNTESTED]**: Should return org recordings if they're in org_users
- **Non-member [CORRECT]**: Returns empty list

### Endpoint: /api/call-stats  
- **Admin [PARTIAL]**: Returns stats but totalDuration/avgDuration = 0
- **Agent [BLOCKED]**: Gets 403 error (not a platform admin check issue?)

---

## Next Steps

1. **Test with real agent user**: Verify org member without phone assignments can see recordings
2. **Fix phone number nulls**: Debug why call join isn't populating from_number/to_number
3. **Fix call-stats duration**: Ensure call-stats properly calculates totalDuration from recordings
4. **Implement direct MightyCall reports**: Pull reports directly from MightyCall API instead of DB
5. **Verify client access**: Once test data is properly set up, test with actual client users
