Steps to apply the project's Supabase/Postgres migrations (safe, manual approach)

Why: The server code expects tables/columns (mightycall_recordings, integration_sync_jobs, org_integrations, etc.). Your runtime DB currently misses some of these objects, causing PGRST204/PGRST205 and FK/NOT NULL errors when syncing real MightyCall data.

Recommended (most reliable): Use Supabase Dashboard SQL Editor

1. Open: https://app.supabase.com → select your project
2. In the left nav choose "SQL" → "Editor"
3. Open the file: `supabase/MASTER_MIGRATION.sql` in your editor (available in the repo)
4. Copy the entire contents and paste into the Supabase SQL Editor
5. Run the migration (click "RUN")
6. Confirm there are no errors in the results pane

Notes:
- This script is idempotent (uses CREATE TABLE IF NOT EXISTS), but it drops some legacy tables intentionally; scan the top comments before applying.
- If you prefer CLI, install the Supabase CLI and use `supabase db reset` or `supabase db push` as appropriate, then run the SQL file.
- Back up your production DB before applying to production.

After applying migrations

1. Restart the backend (`cd server && npm run dev`) so `supabaseAdmin` schema cache refreshes.
2. Run the test endpoint to confirm real data fetch:

```bash
curl -i -H "x-api-key: <PLATFORM_OR_ORG_API_KEY>" "http://localhost:4000/api/mightycall/test-connection?org_id=<ORG_ID>&startDate=2026-01-01&endDate=2026-01-31"
```

3. If the test returns calls/recordings, run full sync:

```bash
curl -X POST -H "Content-Type: application/json" -H "x-api-key: <PLATFORM_OR_ORG_API_KEY>" \
  -d '{"orgId":"<ORG_ID>","startDate":"2026-01-01","endDate":"2026-01-31"}' \
  http://localhost:4000/api/mightycall/sync/recordings
```

If you want, I can:
- prepare a single combined SQL file for copy/paste (done: `supabase/MASTER_MIGRATION.sql` is ready), or
- attempt to apply the SQL automatically (requires DB connection string/psql or supabase CLI installed) — tell me if you want me to proceed with automation.
