# Implementation and rollout

The user authorized implementation after the original audit and explicitly deferred completing Clerk authentication. The working application remains Vite/React plus Express. Existing Supabase authentication is retained in both the dashboard and new Windows tracker. The separate Next.js/Clerk starter is unchanged.

No production migrations, data changes or live monitoring were performed. The implementation is prepared for the user-requested Git push; hosting automation may deploy that push.

## Migration numbering after upstream integration

The upstream `045_admin_client_leads.sql` migration already occupies version 045. The five workforce migrations were renamed from 045?049 to 050?054 before pushing. Their order remains unchanged. If you already applied a workforce script under its old filename, do not execute the renamed copy again; reconcile migration history for that database first. The disposable database suite also applies the upstream client-leads migration and verifies that client access remains denied.

## Phase 1: Readiness and readability

Inter is bundled locally. Organization selection is available on mobile, and stale organization responses cannot overwrite a newer selection. Light/dark preference and the theme switch work. Shared styles correct contrast, disabled controls, focus indicators and native select rendering. The `/api-keys` page no longer collides with the development API proxy. Diagnostics, number requests, recordings and settings expose failures instead of indefinite loading or silent success. Missing sync information is no longer reported as healthy. Organization settings and their audit record now save in one database transaction. API read and CSRF caches are scoped to the authenticated session. UI em dashes were replaced. User-metadata admin fallback and fail-open manager permission lookup were removed. The legacy key page uses safe API metadata and shows a newly created secret only during that page visit. Lead Gen redirects no longer forward access or refresh tokens; the destination handles its own sign-in. Health diagnostics no longer issue a sentinel UPDATE and distinguish policy-presence checks from tenant-isolation verification.

The local ignored client configuration was aligned with the existing project configuration. No credentials are included in this report. Compatible dependency updates removed the reported high-severity vulnerabilities. The label pass added 89 accessible control labels, recorded by file in `control-label-fixes.json`, plus the API-key creation label. Two moderate React Router dependency findings remain; the available remediation requires moving from major version 6 to 7. This app does not use React Router SSR hydration, but the dependency findings remain open.

Validation artifacts: `browser-readiness.json` is the original 35-route audit; `workforce-browser.json` covers the new workspace; `legacy-browser-after.json` records the follow-up legacy route scan; `final-populated-browser.json` covers the final dashboard, API-key create flow, diagnostics and report pages; `dependency-audit.json` records remaining dependency findings. Browser checks use synthetic identities and intercepted responses, not production accounts. Automated checks do not certify populated charts, all translucent/interactive states or live-data behavior.

Test manually: keyboard navigation and native selects; theme persistence; a failed API request and retry; every populated legacy chart/badge at your normal zoom; mobile navigation at 390px and tablet at 768px.

## Phase 2: Roles and permissions

Migrations `050` through `054` introduce the workforce schema and its policies. The API uses a request-scoped Supabase client with the user's verified JWT. It does not use the service-role client for workforce reads or user actions. Each table has RLS; agents see their own records and clients see their membership/assignment scope. Sensitive legacy business tables are restricted to staff. Historical policies and end-user legacy RPC/view access are replaced/revoked to close alternate access paths. Anonymous schema introspection is revoked. Auth bootstrap remains available; nonstaff legacy operational APIs and tenant API keys cannot bypass the workforce boundary.

This is intentionally a breaking permission migration for old client/agent pages. Deploy the API, web workspace and migrations together in staging. Review legacy RPC/trigger dependencies on the real restored schema before production rollout. The in-memory PostgreSQL tests seed all 175 legacy table names, historical permissive policies, multiple clients/agents and private Storage metadata. They exercise tenant separation, writes, privilege escalation, screenshot gating, time caps, overrides, Cairo DST and provider replay identity. Legacy table shapes in that harness are minimal, not a restoration of production.

Existing platform administrators remain administrators. Existing organization agents are seeded as agents; other existing profiles become clients. Organization admins do not become platform admins. New profiles and organizations created through existing staff tools are seeded into workforce tables. An administrator must configure memberships and campaign assignments. Promoting a workforce account to administrator also enables the existing staff tools. Demotion removes the legacy platform-admin role and flag. Both directions are covered by database tests; refresh the account session UI after a role change. Profiles and existing Supabase identities are reused; Clerk identity migration is not implemented.

Test in staging: use three real accounts, including two different client organizations. Confirm direct REST/RPC attempts cannot read another client's records, change roles or write client business data. Confirm staff operations still work after legacy RPC revocation. Verify onboarding and role removal.

## Phase 3: Transfers

The Workforce page provides a fast transfer form with campaign, lead, phone, state, debt amount/qualifying details, outcome and notes. The server derives the agent/client scope from verified identity and assignment. Summary tables support day/week/month/agent/client/campaign groupings, connect rate, hours and transfers per hour. Date, agent, client and campaign filters apply to reports. Clients receive only scoped data and no export controls.

MightyCall call-detail polling and the existing authenticated webhook can feed `wf_ingest_transfer`. Configure explicit extension/business-number/client/campaign/agent routes, then set `WORKFORCE_MIGHTYCALL_SYNC=true` in staging. The flag defaults off. Business numbers in routes use digits only. Unknown mappings, missing timestamps or unconfirmed webhook transfer identities go to the admin inbox. Unknown outcomes remain unconfirmed. Provider identifiers are preferred for replay-safe ingestion; call-detail fallback uses a stable transfer timestamp and target. Lead qualification and missing caller details can be completed manually. The integration has not been verified against this account's real transfer payloads, and is not claimed to capture every provider transfer without that verification. Ingest errors are surfaced in sync errors; raw legacy webhook records remain available for reconciliation.

Official references used: [MightyCall API](https://ccapi.mightycall.com/v4/doc) and [MightyCall API documentation](https://support.mightycall.com/mightycall-api-documentation-mc). The existence of transfer-related API functionality does not by itself prove which transfer event fields this account receives.

Test: log each outcome; replay the same provider transfer twice; verify one entry; send an unmapped/ambiguous event and verify the inbox; compare transfer counts to MightyCall; verify that client filters cannot widen scope. Resolve ambiguous events using the manual form after reviewing the raw provider record.

## Phase 4: Time tracking

Database transactions serialize each agent's clock actions. Sessions contain separate work segments so breaks do not count. Daily and weekly limits can apply globally or per client; the tightest cap wins. The database stores each segment's authorized end. Usage and report calculations clip to that time, even if a scheduler is delayed. The timer warns at 80% and 95%, stops at the allowance, and requires an audited admin override to exceed it. Admins can stop an active session, approve/reject a stopped one, or replace its start/end with a reason; original segments remain in the audit log. Replacement edits intentionally replace break segmentation and the UI says so.

Cairo time and Monday-start weeks determine cap periods. UTC is stored; dates and report boundaries use the viewer's local timezone. For safety, the current timer closes an authorized segment/session at a configured period boundary or a 24-hour authorization ceiling; agents clock in again for the next period. It does not silently roll an unattended timer through multiple days. Browser idle detection measures the dashboard only; system-wide idle detection is in the desktop app. A recent desktop heartbeat prevents browser inactivity from pausing desktop work.

Admin exports are CSV and the browser's Print / Save PDF flow. CSV cells are escaped against formula execution. Activity percentages distinguish sampled minutes from missing samples; they are not described as a measure of work quality.

Test: a two-minute cap, 80%/95% warnings, concurrent tabs, break/resume, reaching a per-client cap while another cap remains, a weekly cap, audited override, admin edit, Cairo midnight and DST, and CSV/PDF filters. Verify the scheduler closes persisted statuses as expected.

## Phase 5: Desktop monitoring

The Electron app and Windows count helper are in `desktop/`. It has a visible tracking indicator, versioned consent, random screenshots, optional blur, count-only input telemetry and optional window titles. No keyboard key values, typed content, clipboard data or cursor coordinates are stored. Collection is limited by local work state, a short authorization lease and server checks. Pause/stop/lock/suspend/logout revoke capture locally. Realtime session updates and polling handle remote changes. No local image or activity spool is written. Agents can view their own samples/images; clients get screenshots only if an administrator enables access for their client.

The private bucket enforces read/upload/delete boundaries independently of older Storage policies. Signed viewing URLs expire after 60 seconds. Admins can delete screenshots. Retention maintenance deletes objects before metadata, deletes old activity samples, and writes deletion/error receipts. It is supplied as a scheduled workflow that is disabled until explicitly enabled for the reviewed deployment.

`desktop/dist/Victory Sync Tracker Setup 0.1.0.exe` is an unsigned Windows development installer. An unpacked build is also available. The application builds and its hidden setup-screen smoke test passes. The native C# helper was compiled without starting capture. Physical Windows capture, multi-monitor/high-DPI behavior, sleep/lock transitions, real Supabase Storage uploads/deletions and the organization's endpoint-protection environment still require staging validation. There is no signed auto-update channel. See `desktop/README.md` for configuration and limitations. Electron security guidance: [security](https://www.electronjs.org/docs/latest/tutorial/security), [desktop capture](https://www.electronjs.org/docs/latest/api/desktop-capturer).

Test: accept disclosure; run a controlled work session; confirm input counts without typed content; pause, lock, sleep, disconnect the network and clock out from another dashboard; verify capture stops; view own screenshots; test another agent and client; enable one client's screenshot access; shorten retention in staging and confirm actual Storage deletion. Sign the installer and establish a controlled update process before production distribution.

## Remaining limitations from the original audit

- Clerk identity linking, Clerk MFA and the separate Next.js starter remain deferred by the user. The legacy browser-only custom MFA gate is not a server-enforced second factor. Do not represent it as one.
- The existing app remains Vite/Express, not a Next.js migration. Legacy duplicate pages, migrations and the large server entrypoint remain; this implementation adds isolated workforce modules.
- Legacy report endpoints still use bounded scans. The dashboard labels the loaded chart sample and warns that large-range legacy totals can omit records. New Workforce reports paginate the complete visible records. Legacy charts and every interactive state still need visual inspection with representative production-like data.
- The initial U17 audit wording overstated the User Settings API-key UI: that duplicate section was already disabled in the baseline. The active organization API-key page is corrected here.
- RLS enforcement, private Storage policies, retention and provider automation are local migration/code changes until the reviewed staging deployment is completed. They have not changed production protection.
- Real account provider payloads, restored-schema legacy dependencies and physical desktop capture remain staging requirements. The unsigned tracker is a development artifact.

## Staging deployment sequence

1. Restore production schema into a separate staging project. Apply `050_workforce_access.sql`, `051_workforce_time_transfers.sql`, `052_workforce_monitoring.sql`, `053_workforce_operations.sql`, then `054_atomic_organization_settings.sql`. Review the broad legacy permission replacement before applying.
2. Configure server `SUPABASE_URL`, existing server-only service key and **public** `SUPABASE_ANON_KEY`; retain existing auth, CSRF and rate-limit configuration. Point the web build at the same staging project/API.
3. Deploy the API and web changes together. Use `/workforce`. Configure roles, clients, memberships, campaigns, assignments, caps and screenshot settings. Screenshot capture and client sharing start disabled.
4. Configure explicit MightyCall routes. Enable the ingestion flag only after comparing real account payloads with staged records.
5. Configure the desktop with staging public credentials and API URL. Keep service keys out of the desktop configuration.
6. Use the SQL `pg_cron` minute task when available for prompt cap reconciliation. For retention, configure the `workforce-production` GitHub environment secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, then enable repository variable `WORKFORCE_MAINTENANCE_ENABLED=true` only for the approved deployment. The workflow runs every five minutes, subject to scheduler delays. It can also be invoked manually. Alternatively run `node server/dist/scripts/workforce_maintenance.js` from a trusted scheduler. The worker is not exposed as a public API.
7. Complete the phase checks above. Production migration/deployment requires separate approval under the user's original instruction. No production action was taken in this implementation.

## Recorded local verification

| Check | Result |
| --- | --- |
| Client production build and separate TypeScript check | Passed |
| Server build, normalization and security tests | Passed, 25 tests after upstream integration |
| Authentication persistence | Passed, 7 tests |
| PostgreSQL migration/RLS suite | Passed, the five workforce migrations plus upstream client-leads migration, 175 seeded legacy table names, multiple tenant identities, role promotion/demotion, caps and screenshot boundaries |
| Workforce browser matrix | Passed, 84 cases across three roles, both themes and 390/768/1440px widths |
| Legacy page scan | Passed, 210 cases; followed by focused checks after final shared-header and page changes |
| Final populated page checks | Passed, 24 cases, including mobile organization selection, existing-key secrecy and new-key creation/display |
| Desktop capture gates and hidden setup-screen smoke | Passed, 2 unit tests plus isolated renderer/capture-off smoke |
| Windows installer | Built successfully, signature status NotSigned |
| Native input helper | C# compiled without starting hooks or capture |
| Diff whitespace check | Passed with repository CRLF handling |

Automated browser runs found no reported violations, uncaught page errors or horizontal overflow in their tested states. Axe reports some contrast checks as incomplete; those are not passes. Synthetic data and screenshots were used. This does not certify every populated chart, interaction, live account or Windows device. No production verification writes were performed.

## Local verification commands

```text
npm run build --workspace client
npx tsc --noEmit -p client/tsconfig.json
npm run test --workspace server
npm run test:auth
npm run test:workforce
npm run test --prefix desktop
node tests/desktop-smoke.mjs
npm run package --prefix desktop
```

For browser checks, serve the built client with Vite preview on localhost, install the Playwright Chromium browser if needed, set `TEST_URL` to that local origin, then run `node tests/workforce-browser.mjs` and `node tests/legacy-browser.mjs`. Both scripts intercept all API/Supabase traffic. Do not point them at production.
