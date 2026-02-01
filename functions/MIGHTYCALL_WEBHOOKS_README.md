# MightyCall Webhook Functions

Complete webhook system for MightyCall integration. These Edge Functions receive data directly from MightyCall and store it in your Supabase database.

## Functions Overview

### 1. **mightycall-calls-webhook**
Receives call records when calls are completed.

**Endpoint:** `https://[project].supabase.co/functions/v1/mightycall-calls-webhook`

**Payload:**
```json
{
  "event": "call.completed",
  "call_id": "call_12345",
  "phone_number": "+12125551234",
  "caller_name": "John Doe",
  "caller_phone": "+14155555678",
  "duration": 180,
  "status": "completed",
  "direction": "inbound",
  "recording_url": "https://mightycall.com/recordings/...",
  "timestamp": "2024-01-20T14:30:00Z",
  "org_id": "org-uuid",
  "integration_id": "integration-uuid"
}
```

**Stored In:** `calls` table + `mightycall_recordings` (if recording_url provided)

---

### 2. **mightycall-sms-webhook**
Receives SMS messages (inbound/outbound).

**Endpoint:** `https://[project].supabase.co/functions/v1/mightycall-sms-webhook`

**Payload:**
```json
{
  "event": "sms.received",
  "sms_id": "sms_12345",
  "phone_number": "+12125551234",
  "direction": "inbound",
  "sender": "+14155555678",
  "recipient": "+12125551234",
  "message": "Hi, I have a question about my order",
  "status": "received",
  "timestamp": "2024-01-20T14:30:00Z",
  "org_id": "org-uuid",
  "integration_id": "integration-uuid"
}
```

**Stored In:** `mightycall_sms_messages` table

---

### 3. **mightycall-recordings-webhook**
Receives recording metadata when recordings are available.

**Endpoint:** `https://[project].supabase.co/functions/v1/mightycall-recordings-webhook`

**Payload:**
```json
{
  "event": "recording.available",
  "recording_id": "rec_12345",
  "call_id": "call_12345",
  "phone_number": "+12125551234",
  "url": "https://mightycall.com/recordings/...",
  "duration": 180,
  "format": "mp3",
  "size_bytes": 2890000,
  "timestamp": "2024-01-20T14:30:00Z",
  "org_id": "org-uuid",
  "integration_id": "integration-uuid"
}
```

**Stored In:** `mightycall_recordings` table

---

### 4. **mightycall-reports-webhook**
Receives metrics and reports (daily/hourly statistics).

**Endpoint:** `https://[project].supabase.co/functions/v1/mightycall-reports-webhook`

**Payload:**
```json
{
  "event": "report.daily",
  "report_id": "rep_12345",
  "report_type": "daily",
  "date": "2024-01-20",
  "phone_number": "+12125551234",
  "metrics": [
    {
      "metric_type": "calls_total",
      "value": 42,
      "unit": "count"
    },
    {
      "metric_type": "calls_completed",
      "value": 40,
      "unit": "count"
    },
    {
      "metric_type": "calls_missed",
      "value": 2,
      "unit": "count"
    },
    {
      "metric_type": "avg_call_duration",
      "value": 240,
      "unit": "seconds"
    },
    {
      "metric_type": "sms_sent",
      "value": 15,
      "unit": "count"
    },
    {
      "metric_type": "sms_received",
      "value": 18,
      "unit": "count"
    }
  ],
  "timestamp": "2024-01-20T23:59:59Z",
  "org_id": "org-uuid",
  "integration_id": "integration-uuid"
}
```

**Stored In:** `mightycall_reports` table

---

## Setup Instructions

### 1. Deploy Functions to Supabase

```bash
# Deploy all functions
npx supabase functions deploy mightycall-calls-webhook
npx supabase functions deploy mightycall-sms-webhook
npx supabase functions deploy mightycall-recordings-webhook
npx supabase functions deploy mightycall-reports-webhook
```

### 2. Set Webhook Secret

Set the `MIGHTYCALL_WEBHOOK_SECRET` environment variable in Supabase:

```bash
# Option 1: Using Supabase Dashboard
# Settings → Edge Functions → Environment Variables
# Add: MIGHTYCALL_WEBHOOK_SECRET = your-secret-key

# Option 2: Using CLI
npx supabase secrets set MIGHTYCALL_WEBHOOK_SECRET="your-secret-key"
```

### 3. Configure MightyCall Webhooks

In MightyCall settings, configure these webhook URLs:

```
Call Webhook:       https://[project].supabase.co/functions/v1/mightycall-calls-webhook
SMS Webhook:        https://[project].supabase.co/functions/v1/mightycall-sms-webhook
Recording Webhook:  https://[project].supabase.co/functions/v1/mightycall-recordings-webhook
Report Webhook:     https://[project].supabase.co/functions/v1/mightycall-reports-webhook
```

**Authorization Header:**
```
Authorization: Bearer your-secret-key
```

Replace `your-secret-key` with the value you set in step 2.

---

## API Authentication

All webhooks require authentication via Bearer token:

```bash
curl -X POST https://[project].supabase.co/functions/v1/mightycall-calls-webhook \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{...payload...}'
```

---

## Error Handling

### 401 Unauthorized
- Missing or invalid `Authorization` header
- Token doesn't match `MIGHTYCALL_WEBHOOK_SECRET`

### 400 Bad Request
- Missing required fields in payload
- No organization context (org_id or integration_id)

### 500 Internal Error
- Database error while storing data
- Invalid data format

All errors return JSON response:
```json
{
  "error": "Error message",
  "details": "Additional details"
}
```

---

## Data Storage

All webhooks automatically:
1. ✅ Verify webhook secret
2. ✅ Validate required fields
3. ✅ Find organization context (from org_id or integration_id)
4. ✅ Find related phone numbers and calls
5. ✅ Store data in appropriate tables
6. ✅ Log results

---

## Organization Context

Each webhook can determine organization context in two ways:

### Option 1: Direct org_id
Include `org_id` in the payload:
```json
{
  "org_id": "org-uuid",
  ...
}
```

### Option 2: Integration ID
Include `integration_id` in the payload:
```json
{
  "integration_id": "integration-uuid",
  ...
}
```

The webhook will look up the organization from the integration.

---

## Phone Number Matching

Webhooks match phone numbers by:
1. Looking for exact match in `phone_numbers` table
2. Filtering by organization
3. Filtering by phone number string

Make sure phone numbers are imported into your system before webhooks post data.

---

## Metric Types

Supported metrics for reports webhook:
- `calls_total` — Total calls
- `calls_completed` — Completed calls
- `calls_missed` — Missed calls
- `calls_transferred` — Transferred calls
- `calls_abandoned` — Abandoned calls
- `avg_call_duration` — Average duration (seconds)
- `sms_sent` — SMS sent
- `sms_received` — SMS received
- `queue_wait_time` — Queue wait time (seconds)
- `agent_active_time` — Agent active time (seconds)

---

## Testing Webhooks

### Manual Test - Calls
```bash
curl -X POST https://[project].supabase.co/functions/v1/mightycall-calls-webhook \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call.completed",
    "call_id": "test_12345",
    "phone_number": "+12125551234",
    "caller_name": "Test Caller",
    "duration": 120,
    "status": "completed",
    "direction": "inbound",
    "timestamp": "2024-01-20T14:30:00Z",
    "org_id": "your-org-id"
  }'
```

### Manual Test - SMS
```bash
curl -X POST https://[project].supabase.co/functions/v1/mightycall-sms-webhook \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "sms.received",
    "sms_id": "test_sms_12345",
    "phone_number": "+12125551234",
    "direction": "inbound",
    "sender": "+14155555678",
    "recipient": "+12125551234",
    "message": "Test message",
    "status": "received",
    "timestamp": "2024-01-20T14:30:00Z",
    "org_id": "your-org-id"
  }'
```

---

## Monitoring Webhooks

### Check Webhook Logs

View function execution logs in Supabase Dashboard:
```
Functions → [function-name] → Logs
```

### Check Stored Data

Query stored data:
```sql
-- View calls
SELECT * FROM calls WHERE org_id = 'your-org-id' ORDER BY call_date DESC;

-- View SMS
SELECT * FROM mightycall_sms_messages WHERE org_id = 'your-org-id' ORDER BY message_date DESC;

-- View recordings
SELECT * FROM mightycall_recordings WHERE org_id = 'your-org-id' ORDER BY created_at DESC;

-- View reports
SELECT * FROM mightycall_reports WHERE org_id = 'your-org-id' ORDER BY report_date DESC;
```

---

## Performance Considerations

- ✅ Webhooks run async and return immediately
- ✅ Database writes are optimized with proper indexing
- ✅ Errors are logged but don't block webhook response
- ✅ Functions scale automatically with Supabase
- ✅ No rate limiting (use Supabase rate limiting if needed)

---

## Troubleshooting

### Webhook not posting data
1. Verify webhook secret matches
2. Check Authorization header format: `Bearer [secret]`
3. Verify org_id exists in payload or integration_id is valid
4. Check Supabase function logs for errors

### Phone numbers not matching
1. Ensure phone numbers are imported into `phone_numbers` table
2. Verify phone number format matches exactly
3. Check that phone number belongs to correct organization

### Data not appearing
1. Check database query: `SELECT * FROM calls WHERE org_id = '...'`
2. Review function logs for errors
3. Verify RLS policies allow inserts (should for service role key)

---

## Next Steps

1. ✅ Deploy all functions
2. ✅ Set webhook secret
3. ✅ Configure MightyCall webhooks
4. ✅ Test with manual cURL requests
5. ✅ Monitor logs and data
6. ✅ Start receiving live data

---

**Status:** Production-Ready  
**Last Updated:** February 1, 2026
