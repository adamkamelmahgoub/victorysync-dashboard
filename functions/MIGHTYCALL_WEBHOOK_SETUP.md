# MightyCall Webhook Setup Guide

## What is `MIGHTYCALL_WEBHOOK_SECRET`?

The `MIGHTYCALL_WEBHOOK_SECRET` is a **shared secret token** used to authenticate and verify that webhook requests from MightyCall are legitimate and haven't been tampered with. It acts like a password between MightyCall's servers and your Edge Function.

There are two ways it can be used:

1. **Bearer Token** - MightyCall sends it in the `Authorization` header as `Bearer <secret>`
2. **HMAC Signature** - MightyCall sends an HMAC-SHA256 signature of the request body in the `x-signature` header

## How to Generate and Set Up the Secret

### Step 1: Generate a Secure Secret

Generate a cryptographically secure random string. You can use any of these methods:

**Using OpenSSL (Linux/Mac):**
```bash
openssl rand -hex 32
```

**Using PowerShell (Windows):**
```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using Python:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Example output: `a7f3c9e2b1d4f8a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3f5a7c9`

### Step 2: Add Secret to Supabase Environment Variables

1. Go to your Supabase Project Dashboard
2. Click **Settings** → **Environment Variables**
3. Click **New variable**
4. Set the following:
   - **Name:** `MIGHTYCALL_WEBHOOK_SECRET`
   - **Value:** Paste your generated secret (e.g., `a7f3c9e2b1d4f8a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3f5a7c9`)
5. Click **Add variable**

Alternatively, use the Supabase CLI:
```bash
npx supabase secrets set MIGHTYCALL_WEBHOOK_SECRET="a7f3c9e2b1d4f8a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3f5a7c9"
```

### Step 3: Configure MightyCall Webhooks

1. Log in to your **MightyCall Account** (https://app.mightycall.com)
2. Navigate to **Settings** → **Integrations** → **Webhooks** (or similar)
3. Add a new webhook with these settings:
   - **Webhook URL:** `https://<your-project-id>.supabase.co/functions/v1/mightycall-webhook`
   - **Event Types:** Select all events you want (calls, SMS, recordings, reports)
   - **Auth Method:** Choose **Bearer Token** or **HMAC-SHA256**
   - **Secret:** Paste the same secret you generated in Step 1

### Step 4: Deploy the Edge Function

```bash
npx supabase functions deploy mightycall-webhook
```

## How Authentication Works in the Edge Function

The webhook handler validates incoming requests in this order:

1. **Bearer Token Check:**
   - Looks for `Authorization: Bearer <token>` header
   - Compares token to `MIGHTYCALL_WEBHOOK_SECRET`
   - If valid, request is accepted

2. **HMAC Signature Check:**
   - Looks for `x-signature`, `x-mc-signature`, or `x-mightycall-signature` header
   - Computes HMAC-SHA256 of the raw request body using the secret
   - Compares computed hash to the signature header (supports hex or base64 encoding)
   - If valid, request is accepted

3. **Rejection:**
   - If neither auth method is valid, request returns `401 Unauthorized`

## Raw Event Storage

All validated webhook events are stored in `mightycall_raw_events` table for auditing purposes:
- `external_event_id` - Unique event ID from MightyCall
- `org_id` - Organization that owns this event
- `event_type` - The event type (e.g., "call.completed")
- `payload` - Full JSON payload as received
- `received_at` - Timestamp when event was received

**Note:** If the `mightycall_raw_events` table doesn't exist, events are still processed but not stored (non-fatal).

## Testing the Webhook

### Test with curl (Bearer Token):

```bash
curl -X POST \
  https://<your-project-id>.supabase.co/functions/v1/mightycall-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a7f3c9e2b1d4f8a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3f5a7c9" \
  -d '{
    "org_id": "your-org-uuid",
    "event": "call.completed",
    "call_id": "test-123",
    "phone_number": "+14155552671",
    "duration": 45,
    "status": "completed",
    "direction": "inbound",
    "timestamp": "2026-02-01T12:00:00Z"
  }'
```

Expected response: `200 OK` with body:
```json
{
  "success": true,
  "message": "Call recorded",
  "event": "call.completed",
  "call_id": "test-123"
}
```

### Test with curl (HMAC Signature):

```bash
# Generate HMAC signature (Linux/Mac)
PAYLOAD='{"org_id":"your-org-uuid","event":"call.completed",...}'
SECRET='a7f3c9e2b1d4f8a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3f5a7c9'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hex -mac HMAC -macopt key=$SECRET | cut -d' ' -f2)

curl -X POST \
  https://<your-project-id>.supabase.co/functions/v1/mightycall-webhook \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Troubleshooting

### "Unauthorized" Error
- Verify the secret in Supabase matches the secret configured in MightyCall
- Ensure the `Authorization` header has correct format: `Bearer <secret>`
- Check that HMAC signature is computed correctly if using signature-based auth

### "No organization context" Error
- Ensure the webhook payload includes `org_id` OR `integration_id`
- If using `integration_id`, verify the integration exists in `org_integrations` table

### "Invalid JSON payload" Error
- Verify the request body is valid JSON
- Check Content-Type header is `application/json`

### Raw Event Not Stored
- The `mightycall_raw_events` table may not exist (non-fatal, events are still processed)
- Check server logs for the warning message

## Environment Variables Summary

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SUPABASE_URL` | URL | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Yes | Supabase service role key (for DB access) |
| `MIGHTYCALL_WEBHOOK_SECRET` | Secret | Yes | Shared secret for webhook authentication |

All these are automatically available in Supabase Edge Functions.
