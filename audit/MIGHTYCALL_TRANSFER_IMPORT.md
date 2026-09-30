# Automatic MightyCall transfer imports

The Express API now polls MightyCall call history, call details and the call journal. Progress is stored per client, so pages resume after a restart. A database lease prevents multiple API instances from processing the same client concurrently. A failed fetch or database write leaves the cursor unchanged for retry. API and webhook events share client-scoped transfer keys when the provider supplies the same call and transfer IDs.

## Deployment

1. Apply [055_mightycall_transfer_sync.sql](../supabase/migrations/055_mightycall_transfer_sync.sql) after the previously supplied 050 through 054 migrations. This adds the disabled-by-default import setting, private import state and service-only lease function. Do not rerun already applied workforce migrations under renamed filenames.
2. Deploy both the client and Express API. The API needs a continuously running Node process for its background interval. Vercel frontend deployment alone does not update `api.victorysync.com` or its environment.
3. In the existing **Admin > MightyCall** page (`/admin/mightycall`), select the client organization and save working API and secret keys. Stored organization credentials take precedence over the API server's `MIGHTYCALL_API_KEY` and `MIGHTYCALL_USER_KEY` fallback. Do not put secret credentials in Vite variables. Stored keys require the API server's existing `INTEGRATIONS_KEY`.
4. In **Workforce > Administration**, configure an active campaign assignment for each agent and an active provider route matching the same agent, client and campaign. Routes use the sending agent's extension and business number. Missing or ambiguous mappings go to the staff review inbox.
5. In **Workforce > Transfers**, choose **Enable automatic import**, then **Sync now**. Status refreshes every 10 seconds; transfer records refresh every 30 seconds for each role under its existing RLS scope. To pause background imports, use the pause button. An already running page may finish. A manual sync still works while paused.

Set `MIGHTYCALL_DISABLE_POLLING=false` on the API server. Setting `WORKFORCE_MIGHTYCALL_SYNC=true` forces imports on and disables the UI pause control until the server override is removed. No production migration, credential change, assignment or import was performed during development.

## Data and timing

The worker starts with the previous 24 hours and processes ten call records or journal records per client per polling cycle. It checks once a minute when idle. A full page advances pagination without advancing the time window. After calls and journal finish, it moves the window forward with a one-hour overlap to catch delayed provider updates. Backlogs can take multiple cycles. Provider updates older than the overlap and history before the initial 24-hour window are not guaranteed to be picked up; use a separately planned backfill for older history.

[MightyCall's official v4 API documentation](https://ccapi.mightycall.com/v4/doc) documents `/calls`, `/calls/{id}` and `/journal/requests?showUsers=true`. The documented call detail schema does not include a transfer event ID or timestamp. Journal users with `agentRole=TransferReceiver` provide evidence of transfer participation, but not an exact event time, outcome or complete transfer sequence. These records are pulled into **Workforce > Audit > Provider events awaiting review**, not counted as fully validated transfers. A call's start time, total duration, completion status, multiple recipients or a transfer counter are not used to invent a completed transfer.

Explicit provider transfer events with an identifiable source agent, business number, lead phone, transfer time and stable identity populate workforce transfers automatically. Unknown outcomes remain unknown. Lead names, state, qualifying details and notes are not invented from phone data; staff can enrich imported records using the existing transfer editor. A callback disposition alone is not proof that a transfer occurred.

The cumulative state counters count successful ingestion attempts, including idempotent replays. Reporting totals come from unique `wf_transfers` records, not these counters. Journal review items and explicit API/webhook events may coexist for a call because the provider does not supply a shared event identity for journal participants. Existing imported records with older source-key formats should be reviewed before historical replay on other deployments.

## Verification and remaining live setup

Local builds, TypeScript checks, fixture tests and an in-memory PostgreSQL suite cover event extraction, duplicate replay, missing timestamps, sending-agent attribution, pagination, partial-page failures, leases and client/agent access denial. Browser fixtures cover both themes, three viewport sizes and all workforce roles. These checks do not authenticate against a working MightyCall account.

Recorded results: client production build and TypeScript check passed; server build and 36 tests passed; the PostgreSQL migration/RLS suite passed with migration 055 included; all 84 browser cases passed with no reported accessibility violations, page errors or horizontal overflow. Admin fixtures also exercised enable and sync buttons. Browser requests were intercepted and database tests ran in memory.

The read-only configuration check found one provider route, zero agent campaign assignments and no stored MightyCall credentials for the routed client. Authentication with the locally configured keys failed. Live transfer ingestion therefore remains unverified and needs working credentials plus an approved assignment setup. The host of `api.victorysync.com` has not been identified.

After deployment, make one known transfer, complete a scan, and confirm its client, agent, campaign, time and outcome or its review-inbox reason. Run another scan to verify the transfer count does not increase from replay. Sign in as the assigned client and a different client to check visibility. No Clerk authentication work is included.
