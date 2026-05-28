# VictorySync Security Audit

Audit date: 2026-05-28

Latest follow-up pass: 2026-05-28

## Fixed In This Pass

- Hardened light mode readability across the app by forcing dark Tailwind surfaces, tables, inputs, placeholders, borders, hover rows, and low-opacity cards into readable light-theme colors.
- Removed realtime client console logging of full row payloads, which could expose lead/contact data in browser consoles.
- Removed raw phone-system response logging from the server integration client.
- Redacted structured server logs for tokens, secrets, passwords, API keys, service keys, JWTs, UUIDs, user IDs, org IDs, and request IDs.
- Changed rate-limit violation logging to store SHA-256 hashed IP addresses instead of raw IP addresses.
- Removed the production fallback that used the service key as the CSRF signing secret. Production now requires `CSRF_SECRET`.
- Removed the production fallback that used the service key as the invite-code signing secret. Production now requires `INVITE_CODE_SECRET`.
- Removed the wildcard `Access-Control-Allow-Origin: *` header from the Vercel API rewrite.
- Removed `VITE_SUPABASE_SERVICE_ROLE_KEY` support from local server scripts so service-role credentials are not encouraged under frontend-style env names.
- Admin-locked `/debug-auth`; it is no longer available to ordinary authenticated users.
- Made the legacy webhook route public-session bypass opt-in with `ENABLE_LEGACY_WEBHOOKS=true`.
- Made production API rate limiting require persistent Redis by default. `ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true` is an emergency override only.
- Added `npm run security:scan` for repeatable static checks around committed secrets, frontend private env names, wildcard CORS, and raw realtime payload logging.

## Verified

- `.env`, `.env.local`, `.env.*.local`, and `server/.env` are ignored by git.
- `git ls-files` shows only `.env.example` is tracked from the env files.
- No service-role key is referenced from `client/src`.
- Frontend uses only the public anon key env names: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- A static secret scan found no obvious committed JWTs/service keys. The one `sk_live_1234567890abcdef` hit is a fake example in `API_REFERENCE.md`.
- Security headers are present in `vercel.json`.
- API rate limiting, CSRF middleware, input sanitation, and API request logging exist in `server/src/security/apiSecurity.ts` and `server/src/index.ts`.
- Client build passed: `npm run --prefix client build`.
- Server TypeScript build passed: `npm run --prefix server build`.
- Follow-up static scan passed: `npm run security:scan`.
- Server test suite passed: `npm run --prefix server test`.

## Remaining High Priority Work

1. Verify live database RLS, not just migration files.
   Run a live query against `pg_tables`/`pg_policies` to confirm every production table has RLS enabled and correct org-scoped policies. Migration files show broad coverage, but only the live database can prove this.

2. Keep `/debug-auth` admin-only.
   This is now admin-routed in the frontend; any backend diagnostic endpoints should follow the same rule.

3. Eliminate direct client database fallbacks.
   Some client components still import the browser database client directly. RLS should protect this, but production-grade posture is cleaner when client pages use server API routes for privileged and multi-tenant data.

4. Finish endpoint-by-endpoint Zod validation.
   A global sanitizer exists, but high-risk mutating endpoints should have strict schemas that reject unknown fields and validate roles/org ownership explicitly.

5. Keep Upstash mandatory in production.
   The rate limiter now fails closed in production if Upstash is missing, unless `ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true` is explicitly set.

6. Tighten CSP.
   Current CSP still allows `'unsafe-inline'` for scripts/styles. Move toward nonces or hashes once the frontend is ready.

7. Keep the legacy webhook disabled unless truly needed.
   The route is no longer public by default. Only set `ENABLE_LEGACY_WEBHOOKS=true` if you intentionally restore that integration.

8. Confirm log retention is active in production.
   Logging tables and retention migrations exist, but production should verify `pg_cron` is installed and scheduled cleanup jobs are running.

9. Audit remaining server console logs.
   Core structured logs are redacted now, but there are still debug-style `console.log` calls in older admin/sync paths and scripts. Keep production `LOG_LEVEL=info` and continue replacing those with redacted structured logs.

10. Enforce pagination everywhere.
    Some endpoints clamp `limit` globally, but older list endpoints should be reviewed to ensure no route can return large unbounded datasets.

## Required Production Env Vars

- `CSRF_SECRET`
- `INVITE_CODE_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MCGRAWNOW_WEBHOOK_SECRET`
- `VICTORYSYNC_DEFAULT_ORG_ID`

Keep all real values only in local/Vercel/Supabase environment settings, never in committed files.
