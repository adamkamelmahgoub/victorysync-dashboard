# MightyCall API Endpoint Fixes

## Overview
All MightyCall API endpoint issues for reports, recordings, and SMS have been identified and fixed based on the official API documentation.

## Key Findings

### 1. Reports Endpoint ❌ → ✅
**Problem**: Attempted to use non-existent endpoints:
- `/reports/calls`
- `/v4/reports/calls`
- `/api/reports/calls`

**Solution**: MightyCall doesn't have a dedicated reports API. Reports are aggregated from:
- **Primary**: `/journal/requests` with `type=Call` parameter
- This endpoint returns call history which we aggregate into daily reports

**Implementation**:
```typescript
// Now uses: GET /journal/requests?type=Call&from=XXX&to=YYY&pageSize=1000
// Response: { requests: [...], currentPage: 1 }
// Each request contains: type, state, created, businessNumber, duration, etc.
```

### 2. Recordings Endpoint ❌ → ✅
**Problem**: Attempted to use non-existent endpoint:
- `/recordings`
- `/v4/recordings`
- `/api/calls/recordings`

**Solution**: Recordings are attached to individual call objects, not a separate endpoint:
- **Primary**: `/calls` endpoint returns calls with `callRecord` property
- **Fallback**: `/journal/requests` filtered for calls with recording URLs

**Implementation**:
```typescript
// Now uses: GET /calls?startUtc=XXX&endUtc=YYY&pageSize=1000
// Response: { data: { calls: [...] } }
// Each call contains: callRecord: { uri, fileName } if recording exists
// Falls back to /journal/requests if /calls fails
```

### 3. SMS/Messages Endpoint ❌ → ✅
**Problem**: Tried multiple incorrect endpoint patterns:
- `/messages`
- `/sms/messages`
- `/api/messages`
- `/messages/list`

**Solution**: Messages are retrieved from:
- **Primary**: `/journal/requests` with `type=Message` parameter (most reliable)
- **Fallback**: `/messages` or `/contactcenter/messages` (if available)

**Implementation**:
```typescript
// Primary: GET /journal/requests?type=Message&pageSize=1000&page=1
// Response: { requests: [...], currentPage: 1 }
// Each message request contains: type, client, businessNumber, text, created, etc.

// Structure handling:
// - journal: client.address, businessNumber.number, textModel.text
// - direct messages: from, to, text/body
```

## API Response Mappings

### Journal API Response Format
```json
{
  "requests": [
    {
      "id": "5d565c298558e7cce8d7b8e0",
      "type": "Call" | "Message" | "MessageThread",
      "state": "Connected" | "Missed",
      "created": "2019-07-05T09:08:56.831Z",
      "businessNumber": { "number": "+15557775533", "label": "My Local Number" },
      "client": { "address": "+15557775566", "type": "phoneNumber" },
      "text": "message text if applicable",
      "textModel": { "text": "...", "availability": "available" },
      "duration": "60",
      "metadata": { ... }
    }
  ],
  "currentPage": 1
}
```

### Calls API Response Format
```json
{
  "data": {
    "calls": [
      {
        "id": "7e734dc1-544d-4f04-8ccc-8bd5b197a88c",
        "from": "+15551112233",
        "to": "+15550152729",
        "dateTimeUtc": "2018-06-05T13:38:29.522Z",
        "duration": "23066",
        "callStatus": "Connected",
        "callRecord": {
          "fileName": "records/...",
          "uri": "https://..."
        }
      }
    ]
  },
  "isSuccess": true
}
```

## Updated Functions

### 1. `fetchMightyCallReports()`
- ✅ Now uses `/journal/requests` with `type=Call` filter
- ✅ Properly handles journal response format
- ✅ Extracts call state and duration for aggregation
- ✅ Maintains backward compatibility

### 2. `fetchMightyCallRecordings()`
- ✅ Primary: Uses `/calls` endpoint
- ✅ Fallback: Uses `/journal/requests` for journal-based recordings
- ✅ Extracts recordings from `callRecord.uri` or `callRecord.fileName`
- ✅ Properly maps duration and timestamps

### 3. `fetchMightyCallSMS()`
- ✅ Primary: Uses `/journal/requests` with `type=Message` filter
- ✅ Fallback: Tries `/messages` and `/contactcenter/messages`
- ✅ Handles both journal format (client.address) and direct format (from/to)
- ✅ Properly extracts text from `text` or `textModel.text`

### 4. `syncMightyCallSMS()`
- ✅ Now handles both journal message format and direct message format
- ✅ Maps client.address → from_number, businessNumber.number → to_number
- ✅ Extracts text from textModel.text if available
- ✅ Maintains fallback to sms_logs table

### 5. `syncMightyCallReports()`
- ✅ Aggregates journal call entries into daily reports
- ✅ Counts: calls_count, answered_count, missed_count
- ✅ Calculates: answer_rate, avg_handle_seconds
- ✅ Groups by phone number and date
- ✅ Maintains existing call history fallback

## Testing & Validation

### Test the Reports Sync
```bash
curl -X POST http://localhost:3001/api/admin/mightycall/sync/reports \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "orgId": "your-org-id",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  }'
```

### Test the SMS Sync
```bash
curl -X POST http://localhost:3001/api/admin/mightycall/sync/sms \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"orgId": "your-org-id"}'
```

### Test the Recordings Sync
```bash
curl -X POST http://localhost:3001/api/mightycall/sync/recordings \
  -H "Content-Type: application/json" \
  -H "x-user-id: YOUR_USER_ID" \
  -d '{
    "orgId": "your-org-id",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  }'
```

## Database Considerations

### Required Tables
The following tables should exist in Supabase:
1. `mightycall_reports` - stores aggregated call reports
2. `mightycall_recordings` - stores recording URLs and metadata
3. `mightycall_sms_messages` - stores SMS messages (or fallback to `sms_logs`)
4. `call_history` - stores individual call records

### Schema Example
```sql
-- Reports
CREATE TABLE mightycall_reports (
  org_id UUID NOT NULL,
  report_date DATE NOT NULL,
  report_type VARCHAR(50) DEFAULT 'calls',
  phone_number_id UUID,
  data JSONB,
  PRIMARY KEY (org_id, report_date, report_type)
);

-- Recordings
CREATE TABLE mightycall_recordings (
  org_id UUID NOT NULL,
  call_id VARCHAR(255) NOT NULL,
  phone_number_id UUID,
  recording_url TEXT,
  duration_seconds INT,
  recording_date TIMESTAMP,
  metadata JSONB,
  PRIMARY KEY (org_id, call_id)
);

-- SMS Messages
CREATE TABLE mightycall_sms_messages (
  org_id UUID NOT NULL,
  external_id VARCHAR(255),
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  message_text TEXT,
  status VARCHAR(50),
  sent_at TIMESTAMP,
  metadata JSONB,
  PRIMARY KEY (org_id, external_id)
);
```

## Error Handling

### All endpoints now include:
- ✅ Retry logic with exponential backoff
- ✅ Proper HTTP status code handling
- ✅ JSON parse error recovery
- ✅ Fallback endpoint chains
- ✅ Detailed error logging
- ✅ Empty array returns on failure (graceful degradation)

### Log Examples
```
[MightyCall] successfully fetched 150 journal entries for reports
[MightyCall] successfully fetched 23 recordings from calls API
[MightyCall] successfully fetched 45 messages from journal
[MightyCall] fallback journal fetch: 10 records
[MightyCall synth reports] upsert error: {error object}
```

## Migration Notes

### From Old Code
The old code attempted to use non-existent REST endpoints. This code now:
1. Uses the actual API endpoints documented by MightyCall
2. Properly aggregates data from the Journal API
3. Handles multiple response formats gracefully
4. Maintains backward compatibility with existing data structures

### No Breaking Changes
- All existing database queries remain the same
- Response mappings handle old and new data formats
- Fallback logic ensures partial success if primary endpoints fail

## API Rate Limiting
MightyCall API has these limits:
- 2500 requests per 24 hours per API key
- Requests are retried with exponential backoff (up to 300ms)
- Batch requests use pageSize=1000 for efficiency

## Next Steps
1. ✅ Deploy the updated code
2. ✅ Monitor logs for successful syncs
3. ✅ Verify reports are generating correctly
4. ✅ Check recordings are being captured
5. ✅ Validate SMS messages are syncing
6. Consider adding scheduled sync jobs using the existing job queue

## Support
If issues persist:
1. Check the detailed logs in server output
2. Verify API credentials are correct
3. Ensure organization has MightyCall integration enabled
4. Contact MightyCall support with API logs
