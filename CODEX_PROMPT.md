# CODEX PROMPT — Fix SMS Flow, Recordings & Live Status

## PROJECT OVERVIEW

This is the Victory Sync dashboard — a call center management platform. It integrates with the MightyCall API to sync calls, recordings, SMS messages, and live agent status. The frontend is React/TypeScript, the backend is Node.js/TypeScript, and the database is Supabase (PostgreSQL).

## FILES YOU NEED TO WORK ON

### Backend (server/)
1. `server/src/integrations/mightycall.ts` — All MightyCall API integration logic
2. `server/src/routes/mightycall.ts` — API routes for MightyCall endpoints
3. `server/src/routes/sms.ts` — API routes for SMS endpoints
4. `server/src/routes/recordings.ts` — API routes for recording endpoints
5. `server/src/routes/liveStatus.ts` — API routes for live status endpoints

### Frontend (client/src/)
6. `client/src/pages/SMSPage.tsx` — SMS messaging page
7. `client/src/pages/RecordingsPage.tsx` — Call recordings page
8. `client/src/pages/LiveStatusPage.tsx` — Live agent status page
9. `client/src/lib/apiClient.ts` — Frontend API client functions

## ISSUES TO FIX

### ISSUE 1: SMS Flow — Messages Not Syncing Properly

**Problem:** The SMS sync is not working correctly. Messages fetched from the MightyCall API are not being properly stored and displayed.

**Root Causes:**
1. The `syncMightyCallSMS()` function in `mightycall.ts` fetches messages from the `/journal/requests` endpoint with `type=Message`, but the response parsing may not handle all the different message formats that MightyCall returns.
2. The SMS send endpoint uses `/contactcenter/messages/send` but the MightyCall API documentation shows the correct endpoint is `/messages/send` or `/contactcenter/messages`.
3. There's no real-time SMS polling — messages only appear after a manual sync.
4. The `sms_logs` table and `mightycall_sms_messages` table may have schema mismatches.

**Fix Required:**
1. Update `fetchMightyCallSMS()` to properly handle the MightyCall journal response format. According to the MightyCall API docs, SMS messages come from `/journal/requests?type=Message` and each message has this structure:
   ```json
   {
     "id": "string",
     "type": "Message",
     "created": "ISO timestamp",
     "businessNumber": { "number": "+15557775533" },
     "client": { "address": "+15557775566" },
     "textModel": { "text": "message body" },
     "direction": "Inbound" | "Outbound",
     "messageDeliveryStatus": "Delivered" | "Sent" | "Failed"
   }
   ```
2. Update `sendMightyCallSMS()` to try these endpoints in order:
   - `/contactcenter/messages/send`
   - `/messages/send`
   - `/api/messages/send`
   
   The request body should be:
   ```json
   {
     "from": "+15557775533",
     "to": ["+15557775566"],
     "message": "Hello"
   }
   ```
   Headers should include:
   ```
   Authorization: Bearer {access_token}
   x-api-key: {api_key}
   Content-Type: application/json
   ```
3. Add a new backend endpoint `GET /api/sms/messages` that queries the `mightycall_sms_messages` table with proper pagination (limit/offset), org filtering, and search.
4. Add a new backend endpoint `POST /api/sms/send` that accepts `{ from, to, message, orgId }` and calls `sendMightyCallSMS()`.
5. Ensure the `mightycall_sms_messages` table has this exact schema:
   ```sql
   CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
     phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
     external_id text,
     from_number text,
     to_number text,
     message_text text,
     direction text,
     status text,
     sent_at timestamptz,
     message_date timestamptz,
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now(),
     metadata jsonb,
     UNIQUE(org_id, external_id)
   );
   ```
6. Add real-time SMS polling to the SMSPage frontend — poll for new messages every 10 seconds when the page is visible.

### ISSUE 2: Recordings Not Syncing Properly

**Problem:** Call recordings are not appearing in the dashboard after sync.

**Root Causes:**
1. The `mightycall_recordings` table has a foreign key constraint `mightycall_recordings_call_id_fkey` that references the `calls` table. Since the `calls` table may not have matching records, inserts fail.
2. The recording fetch logic in `fetchMightyCallRecordings()` tries to extract recording URLs from call objects, but the URL extraction is incomplete.
3. There's no pagination on the recordings API endpoint.

**Fix Required:**
1. **Drop the FK constraint** on the recordings table. Run this SQL:
   ```sql
   ALTER TABLE public.mightycall_recordings 
     DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;
   
   ALTER TABLE public.mightycall_recordings 
     ALTER COLUMN call_id DROP NOT NULL;
   ```
2. Update `fetchMightyCallRecordings()` to properly extract recording URLs. According to the MightyCall API docs, recordings are available from:
   - `/calls` endpoint — each call object has `callRecord: { uri: "https://...", fileName: "..." }`
   - `/journal/requests?type=Call` — each call has `recording: { link: "...", uri: "..." }`
   
   The function should:
   - First try `/calls` with date range and extract `callRecord.uri` from each call
   - Fall back to `/journal/requests?type=Call` and extract `recording.link`
   - Deduplicate by recording URL
3. Update the recordings API endpoint `GET /api/mightycall/recordings` to support:
   - `limit` and `offset` pagination
   - `org_id` filtering
   - `start_date` and `end_date` filtering
   - `search` parameter for phone number search
4. Update the recording download endpoint `GET /api/recordings/:id/download` to:
   - Fetch the recording URL from the database
   - Stream the audio file from MightyCall through the server
   - Set proper Content-Type and Content-Disposition headers
5. Add a recording player to the RecordingsPage frontend — an inline audio player that plays the recording without downloading.

### ISSUE 3: Live Status Not Updating When On a Call

**Problem:** The live agent status page shows stale data. When an agent is on a call, the status doesn't update in real-time.

**Root Causes:**
1. The live status endpoint polls the MightyCall API, but the polling interval (2 seconds) may be too aggressive and cause rate limiting.
2. The `fetchMightyCallLiveCallByExtension()` function uses multiple strategies but may not be correctly identifying live calls.
3. The `fetchMightyCallProfileStatusByExtension()` function tries many endpoints but may not be getting the actual live call status.
4. There's no WebSocket or Server-Sent Events (SSE) for real-time updates — the frontend relies solely on polling.

**Fix Required:**
1. **Improve the live status detection logic.** According to the MightyCall API docs, the correct way to get live call status is:
   
   **Option A — Use `/calls` with filters:**
   ```
   GET /calls?extension={ext}&callFilter=Connected&customFilter=Open
   ```
   This returns only active/connected calls for that extension.
   
   **Option B — Use `/journal/requests` with filters:**
   ```
   GET /journal/requests?type=Call&state=Connected
   ```
   This returns all currently connected calls.
   
   **Option C — Use `/profile/status` or `/extensions/status`:**
   ```
   GET /profile/status?extension={ext}
   GET /extensions/{ext}/status
   ```
   This returns the agent's current status (Available, On Call, DND, etc.)

2. Update `fetchMightyCallLiveCallByExtension()` to:
   - Use `/calls?extension={ext}&callFilter=Connected&customFilter=Open` as the primary strategy
   - Fall back to `/journal/requests?type=Call&state=Connected` filtered by extension
   - Return the call details including: `from`, `to`, `dateTimeUtc`, `duration`, `callStatus`, `callRecord`

3. Update `fetchMightyCallProfileStatusByExtension()` to:
   - Use `/profile/status?extension={ext}` as primary
   - Fall back to `/extensions/{ext}/status`
   - Return: `status` (Available/On Call/DND/Offline), `extension`, `display_name`

4. **Add a new backend endpoint** `GET /api/live-status` that:
   - Accepts optional `org_id` parameter
   - Fetches all extensions for the org
   - For each extension, calls the live call API and profile status API
   - Returns an array of agent status objects:
     ```json
     {
       "items": [
         {
           "user_id": "uuid",
           "org_id": "uuid",
           "email": "agent@example.com",
           "extension": "123",
           "display_name": "Agent Name",
           "on_call": true,
           "counterpart": "+15557775566",
           "status": "Connected",
           "direction": "outbound",
           "from_number": "+15557775533",
           "to_number": "+15557775566",
           "started_at": "2025-05-11T10:30:00Z",
           "raw_status": "Connected",
           "api_source": "/calls?extension=123",
           "refreshed_at": "2025-05-11T10:35:00Z"
         }
       ],
       "refreshed_at": "2025-05-11T10:35:00Z"
     }
     ```

5. **Add a force-sync endpoint** `POST /api/live-status/sync` that:
   - Triggers an immediate status refresh
   - Returns the updated status data

6. **Update the LiveStatusPage frontend** to:
   - Poll every 5 seconds (not 2 seconds) to avoid rate limiting
   - Show a "Live" indicator with a pulsing green dot when status is fresh (< 30 seconds old)
   - Show a "Stale" warning when data is older than 60 seconds
   - Display call duration in real-time (update every second using local timer)
   - Show the counterpart number (who the agent is talking to)
   - Show call direction (inbound/outbound)

## MIGHTYCALL API REFERENCE

Base URL: `https://api.mightycall.com` (or your configured `MIGHTYCALL_BASE_URL`)

### Authentication
All requests require:
```
Authorization: Bearer {access_token}
x-api-key: {api_key}
```

Get access token via:
```
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={api_key}&client_secret={user_key}
```

### Key Endpoints

#### Calls
```
GET /calls?startUtc=2025-01-01T00:00:00Z&endUtc=2025-01-31T23:59:59Z&pageSize=1000&extension={ext}&callFilter=Connected&customFilter=Open
```
Returns: `{ data: { calls: [{ id, from, to, dateTimeUtc, duration, callStatus, callRecord: { uri, fileName } }] } }`

#### Journal (Calls + SMS)
```
GET /journal/requests?type=Call&from=2025-01-01&to=2025-01-31&pageSize=1000&page=1
GET /journal/requests?type=Message&from=2025-01-01&to=2025-01-31&pageSize=1000&page=1
```
Returns: `{ requests: [...], currentPage: 1 }`

#### SMS Send
```
POST /contactcenter/messages/send
{
  "from": "+15557775533",
  "to": ["+15557775566"],
  "message": "Hello"
}
```

#### Extensions/Agents
```
GET /extensions
GET /users
GET /agents
```
Returns agent/extension data including `extension`, `display_name`, `email`

#### Profile Status
```
GET /profile/status?extension={ext}
GET /extensions/{ext}/status
```
Returns: `{ status: "Available" | "On Call" | "DND" | "Offline", extension: "123" }`

#### Phone Numbers
```
GET /phonenumbers
GET /phone_numbers
```
Returns: `{ data: phoneNumbers: [{ id, number, label, isEnabled }] }`

## STEP-BY-STEP INSTRUCTIONS FOR CODEX

### Step 1: Fix the Database Schema
Run these SQL migrations in Supabase:

```sql
-- Fix recordings FK constraint
ALTER TABLE public.mightycall_recordings 
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

ALTER TABLE public.mightycall_recordings 
  ALTER COLUMN call_id DROP NOT NULL;

-- Create SMS table if not exists
CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  external_id text,
  from_number text,
  to_number text,
  message_text text,
  direction text,
  status text,
  sent_at timestamptz,
  message_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE(org_id, external_id)
);

-- Create indexes for SMS
CREATE INDEX IF NOT EXISTS idx_sms_org_id ON public.mightycall_sms_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_external_id ON public.mightycall_sms_messages(external_id);

-- Create index for recordings
CREATE INDEX IF NOT EXISTS idx_recordings_org_id ON public.mightycall_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_recordings_recording_date ON public.mightycall_recordings(recording_date DESC);
```

### Step 2: Update `server/src/integrations/mightycall.ts`

1. Update `fetchMightyCallSMS()` to properly parse the journal response:
   - Extract `from_number` from `client.address`
   - Extract `to_number` from `businessNumber.number`
   - Extract `message_text` from `textModel.text` or `text`
   - Extract `direction` from `direction` field
   - Extract `status` from `messageDeliveryStatus`
   - Extract `sent_at` from `created`

2. Update `sendMightyCallSMS()` to try multiple endpoints:
   - Primary: `/contactcenter/messages/send`
   - Fallback 1: `/messages/send`
   - Fallback 2: `/api/messages/send`

3. Update `fetchMightyCallRecordings()` to:
   - Use `/calls` with `callFilter=Connected` for recent calls
   - Extract `callRecord.uri` from each call
   - Fall back to `/journal/requests?type=Call` for `recording.link`
   - Return deduplicated recordings

4. Update `fetchMightyCallLiveCallByExtension()` to:
   - Primary: `/calls?extension={ext}&callFilter=Connected&customFilter=Open`
   - Fallback: `/journal/requests?type=Call&state=Connected` filtered by extension
   - Return full call details

5. Update `fetchMightyCallProfileStatusByExtension()` to:
   - Primary: `/profile/status?extension={ext}`
   - Fallback: `/extensions/{ext}/status`
   - Return `{ status, extension, display_name }`

### Step 3: Update Backend Routes

1. Update `server/src/routes/sms.ts`:
   - `GET /api/sms/messages` — Query `mightycall_sms_messages` with pagination, org filtering, search
   - `POST /api/sms/send` — Send SMS via MightyCall API

2. Update `server/src/routes/recordings.ts`:
   - `GET /api/mightycall/recordings` — Query with pagination, org filtering, date range, search
   - `GET /api/recordings/:id/download` — Stream audio from MightyCall

3. Update `server/src/routes/liveStatus.ts`:
   - `GET /api/live-status` — Get live status for all agents in an org
   - `POST /api/live-status/sync` — Force refresh live status

### Step 4: Update Frontend

1. Update `client/src/pages/SMSPage.tsx`:
   - Add real-time polling (every 10 seconds)
   - Fix the send SMS flow to use the new API endpoint
   - Add conversation view (group messages by phone number)
   - Show message status (sent, delivered, failed)

2. Update `client/src/pages/RecordingsPage.tsx`:
   - Add inline audio player for each recording
   - Add date range filter
   - Add phone number search
   - Show recording duration and date properly

3. Update `client/src/pages/LiveStatusPage.tsx`:
   - Change poll interval to 5 seconds
   - Add "Live" indicator (green pulsing dot) for fresh data
   - Add "Stale" warning for old data
   - Show real-time call duration counter
   - Show counterpart number and call direction
   - Add agent status badges (Available, On Call, DND, Offline, Ringing, Wrap Up)

### Step 5: Test Everything

1. Run the SMS sync and verify messages appear in the dashboard
2. Send a test SMS and verify it goes through
3. Run the recordings sync and verify recordings appear
4. Play a recording in the browser
5. Check live status while an agent is on a call — verify it updates in real-time

## IMPORTANT NOTES

- Do NOT change the existing database schema for `calls`, `phone_numbers`, or `organizations` tables
- Do NOT change the authentication flow
- Do NOT change the Supabase client configuration
- Keep all existing error handling patterns
- Use the same code style as the existing files (TypeScript, async/try-catch, console.warn for errors)
- All new endpoints should follow the existing pattern: check auth, validate input, call the integration function, return JSON
- The MightyCall API base URL and credentials come from environment variables: `MIGHTYCALL_BASE_URL`, `MIGHTYCALL_API_KEY`, `MIGHTYCALL_USER_KEY`
