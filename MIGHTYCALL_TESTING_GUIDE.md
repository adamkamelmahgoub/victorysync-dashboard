# MightyCall API Sync Testing Guide

## Quick Test Commands

### 1. Sync Phone Numbers
```bash
curl -X POST http://localhost:3001/api/mightycall/sync/phone-numbers \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY"
```

### 2. Sync Reports (Calls)
```bash
curl -X POST http://localhost:3001/api/mightycall/sync/reports \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "orgId": "YOUR_ORG_ID",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z"
  }'
```

### 3. Sync Recordings
```bash
curl -X POST http://localhost:3001/api/mightycall/sync/recordings \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "orgId": "YOUR_ORG_ID",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z"
  }'
```

### 4. Sync SMS/Messages
```bash
curl -X POST http://localhost:3001/api/mightycall/sync/sms \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"orgId": "YOUR_ORG_ID"}'
```

### 5. Sync Call History
```bash
curl -X POST http://localhost:3001/api/admin/mightycall/call-history/sync \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "orgId": "YOUR_ORG_ID",
    "dateStart": "2024-01-01",
    "dateEnd": "2024-12-31"
  }'
```

## Expected Responses

### Successful Reports Sync
```json
{
  "success": true,
  "message": "Synced X reports and Y recordings",
  "reports_synced": 30,
  "recordings_synced": 15
}
```

### Successful SMS Sync
```json
{
  "smsSynced": 45
}
```

### Successful Recordings Sync
```json
{
  "recordingsSynced": 23
}
```

## Checking Server Logs

### For Reports Sync
Look for:
```
[MightyCall] successfully fetched NN journal entries for reports
[MightyCall] successfully fetched MM recordings from calls API
[MightyCall sync reports] upsert completed
[MightyCall sync recordings] upsert completed
```

### For SMS Sync
Look for:
```
[MightyCall] successfully fetched NN messages from journal
[MightyCall SMS] mightycall_sms_messages upsert completed
```

### For Recording Sync
Look for:
```
[MightyCall] successfully fetched NN recordings from calls API
```

## Troubleshooting

### Issue: Reports endpoint returning empty
**Solution**:
1. Verify organization has call history in MightyCall
2. Check date range is correct (use ISO 8601 format)
3. Check logs for: `[MightyCall] could not find working reports endpoint`

### Issue: Recordings not syncing
**Solution**:
1. Verify calls in the date range have recordings
2. Check API key has permissions for call records
3. Check logs for: `[MightyCall] could not find working recordings endpoint`

### Issue: SMS not syncing
**Solution**:
1. Verify organization has SMS/messages in MightyCall
2. Check organization has message history
3. Check logs for: `[MightyCall] could not find working SMS endpoint`

### Issue: 401 Unauthorized
**Solutions**:
- Verify API key is correct
- Verify API key has not expired
- Check organization integration is enabled
- Regenerate API key in MightyCall settings

### Issue: 403 Forbidden
**Solutions**:
- Verify user has admin access
- Check organization permissions
- Verify subscription plan includes API access

## Monitoring Database

### Check Reports Were Inserted
```sql
SELECT COUNT(*) FROM mightycall_reports WHERE org_id = 'YOUR_ORG_ID';
```

### Check Recordings Were Inserted
```sql
SELECT COUNT(*) FROM mightycall_recordings WHERE org_id = 'YOUR_ORG_ID';
```

### Check SMS Messages Were Inserted
```sql
SELECT COUNT(*) FROM mightycall_sms_messages WHERE org_id = 'YOUR_ORG_ID';
```

### View Latest Reports
```sql
SELECT * FROM mightycall_reports 
WHERE org_id = 'YOUR_ORG_ID' 
ORDER BY report_date DESC 
LIMIT 10;
```

### View Recordings with URLs
```sql
SELECT call_id, recording_url, recording_date 
FROM mightycall_recordings 
WHERE org_id = 'YOUR_ORG_ID' AND recording_url IS NOT NULL
LIMIT 20;
```

## API Endpoint Status Check

### Check API is Working
```bash
curl http://api.mightycall.com/v4/ping
```

Expected response:
```json
{
  "data": "4",
  "isSuccess": true
}
```

### Check Authentication
```bash
curl -X POST https://api.mightycall.com/v4/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "x-api-key: YOUR_API_KEY" \
  -d 'grant_type=client_credentials&client_id=YOUR_API_KEY&client_secret=YOUR_SECRET'
```

## Performance Notes

- Reports endpoint returns up to 1000 calls per request
- SMS endpoint returns up to 1000 messages per request  
- Recordings are extracted from calls (no separate endpoint)
- Typical sync time: 2-5 seconds for full date range
- Recommended sync frequency: Daily at off-peak hours

## Debug Mode

To see detailed request/response info, check server logs with:
```bash
tail -f server.log | grep "MightyCall"
```

This will show:
- All endpoint attempts
- Response status codes
- JSON parse attempts
- Fallback activations
- Database errors
