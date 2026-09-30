> Historical pre-implementation audit. The user subsequently authorized implementation and deferred Clerk auth. See [implementation and rollout](IMPLEMENTATION_AND_ROLLOUT.md) for current status.

# Victory Sync readiness audit and proposed build plan

Audit date: September 29, 2026. Status: awaiting approval. No application source, migrations, authentication configuration, or production business records were changed. Local builds and audit artifacts were generated.

**Recommendation: repair the authorization foundation before releasing new operational features.** Passing builds currently coexist with permissive database policies, a split authentication implementation, and an incomplete workforce model.

## Scope and evidence

I inventoried the client, server, separate Next.js starter, SQL migrations and older SQL scripts, edge functions, scripts, tests, deployment configuration, and all 44 page source files. I inspected the configured live Supabase schema and policy definitions through metadata-only RPCs and the configured Clerk instance through read-only API calls. No calls, transfers, emails, invites, payments, or database migrations were triggered.

Evidence files:

- [Database inventory](database-inventory.json): all 175 live public tables, columns, foreign keys, indexes, policies, triggers, enums, and a function security inventory. No business rows or credentials.
- [Browser checks](browser-readiness.json): 210 attempted route/viewport/theme combinations across 35 route URLs, at 390, 768, and 1440 pixels. Synthetic authentication and empty API responses isolated the browser from production. Dark mode was forced because the application disables it. The `/api-keys` direct-load attempt returned a local proxy error and therefore did not exercise that page's content.
- [Error-state checks](error-state-checks.json): four routes with simulated API failures.
- [Dark dashboard screenshot](dashboard-dark.png): visually confirms nearly invisible text on the overview's white gradient in forced dark mode.

These browser checks are an initial readability and layout audit, not a claim that every populated table, chart, dialog, hover/focus state, keyboard interaction, or real account workflow passed. Contrast estimates composite CSS colors and approximate gradients using the first stop; actual gradient pixels and disabled opacity still need full validation. Empty fixtures cannot prove tenant isolation or real data correctness.

### Checks actually run

| Check | Result |
| --- | --- |
| Client production build | Passed. Browserslist data is outdated; Vite reported plugin timing warnings. |
| Client TypeScript, `tsc -p client/tsconfig.json --noEmit` | Passed. This is separate from the Vite build. |
| Server TypeScript build | Passed. |
| MightyCall normalization tests | 8 passed. |
| Static security tests | 16 passed. |
| Authentication persistence tests | 7 passed. |
| Separate `my-clerk-app` Next.js production build | Passed; only the starter home and not-found routes exist. |
| Existing security scan | Passed across 717 tracked files; endpoint audit reports 107 metadata review flags despite no findings. |
| Empty-fixture responsive checks | No document-level horizontal overflow at the three tested widths. This does not validate populated tables. |
| Forced API error checks | Diagnostics produces an unhandled rejection; number requests disguises failure as empty data; settings can remain loading indefinitely without an organization. |
| Cross-tenant read/write tests with real role sessions | Not run. Existing tests do not establish the requested security guarantees. No production mutation attempts were made. |

## Architecture and authentication findings

| ID / priority | Finding and file | Proposed fix |
| --- | --- | --- |
| A01 / High | `vercel.json` deploys **Vite**, outputs `client/dist`, and proxies to an external Express API. `client/package.json` uses React Router. `my-clerk-app/` is a separate Next.js/Clerk starter outside the root workspaces. This is not currently a deployed Next.js dashboard in the repository configuration. | Preserve functioning React components and API behavior. Recommended scope is to retain Vite/Express and complete Clerk integration. If Next.js is mandatory, approve a separate shell/routing migration with parity checks before switching deployment. |
| A02 / High | `client/.env` points to a Supabase hostname that returns DNS `ENOTFOUND`. `server/.env` points to a different, reachable project. Root `.env.local` contains the reachable client URL, but Vite's client root does not automatically use that file. `client/.env.local` contains a differently spelled unprefixed URL. | Consolidate environment ownership, validate hostname/key/project matching at startup, and use explicit local/staging/production configurations. Verify deployed Vercel values separately; the local failure does not establish a production outage. |
| A03 / High | `client/src/contexts/AuthContext.tsx`, `lib/supabaseClient.ts`, and `lib/installAuthenticatedFetch.ts` still use Supabase password sessions. `server/src/security/apiSecurity.ts` accepts Clerk and Supabase tokens. `/api/auth/login` in `server/src/index.ts` returns 410 with a Clerk migration message, while the active browser signs in directly through Supabase. | Choose and finish one authentication path. Implement Clerk in the active frontend, pass Clerk session tokens to Supabase, and explicitly migrate/link existing UUID identities before retiring legacy sessions. |
| A04 / High | The Clerk instance selected by the local key has one user, one organization, one `org:admin` membership, no public/private user role metadata, and no user `externalId` mapping. `apiSecurity.ts` falls back to matching a profile by email. Organization admin is not the same as Victory Sync platform admin. | Use a unique immutable Clerk-subject-to-internal-user mapping. Keep platform roles and client assignments admin-controlled in the database. Do not infer platform access from a customer's Clerk organization role. Verify the production Clerk instance and Supabase third-party-auth configuration before cutover. |
| A05 / High | `server/src/config/env.ts` loads `server/.env`; the locally available Clerk secret is in root `.env`. The normal local server startup is therefore not guaranteed to receive it. | Define one documented server environment loader and required-auth validation. Do not print keys. |
| A06 / Medium | `client/vite.config.ts` proxies the `/api` prefix, which also catches `/api-keys`. A direct local preview GET to `/api-keys` returned **502**, while `/dashboard` returned HTML. | Anchor the proxy to `/api/` and test direct loads of every SPA route. |
| A07 / High | `vercel.json` restricts scripts/connections to the present stack and restricts images to self/data/blob. Remote Supabase profile/logo URLs and future Clerk resources are not covered by that image/script policy. | Inventory actual hosts; add only required image, auth, websocket, and media origins. Test the delivered production headers and Clerk sign-in. Do not simply disable CSP. |
| A08 / Medium | `server/src/index.ts` is approximately 19,000 lines; numerous old migrations, dashboard variants, diagnostic scripts, and completion reports coexist. Duplicate migration prefixes appear outside `supabase/migrations/`. The live database also contains substantial outreach schema absent from this dashboard's migration history. | Establish the authoritative migration baseline and table ownership. Refactor touched server concerns incrementally; archive obsolete pages/scripts only after import and deployment checks. Never rerun old combined migrations against production. |

## Roles, database policies, and sensitive data

**Live findings:** RLS is enabled on all 175 public tables. Eighty-three tables have no policies, which normally denies ordinary RLS-bound access and may be intentional for service-only data. Fifty tables have write policies based on organization membership alone. RLS being enabled is not evidence that clients are read-only.

| ID / priority | Finding and file | Proposed fix |
| --- | --- | --- |
| S01 / Critical | `supabase/migrations/026_security_hardening_rls_rate_limits.sql` installs organization-member INSERT/UPDATE/DELETE policies. The live definitions confirm this on calls, transfers, `org_users`, `org_members`, billing, integrations, phone assignments, and `audit_logs`, among others. Additional restrictive-looking permissive policies do not cancel these grants. | Replace the overlapping policies, not just add new ones. Explicitly separate platform admin, agent-own operations, and client SELECT-only scope. Protect membership and assignment changes as admin-only. |
| S02 / Critical risk | Live `profiles_self_update` and `profiles_self_or_admin_update` allow a user to update their own profile row. That row contains `global_role`, `is_global_admin`, and `can_upload_leads`. The observed profile triggers only maintain timestamps. Column grants were not available in the metadata export, so exploitability was not tested. Source: migration 026 and live inventory. | Restrict column privileges and move security attributes to an admin-only table or protected function. Prove that changing any privilege field through direct REST fails in staging. |
| S03 / Critical | `server/src/lib/supabaseClient.ts` exports a service-role client used throughout the API. It bypasses RLS, so endpoint filtering is currently the security boundary for those requests. | Use a request-scoped Supabase client carrying the verified Clerk JWT for ordinary user reads/writes. Reserve service role for narrowly scoped provider ingestion, retention, and trusted administrative jobs. Enforce actor/tenant checks on every privileged function. |
| S04 / High | `server/src/auth/rbac.ts` accepts `auth.users.user_metadata.role` as an admin fallback. User metadata is not a safe authoritative privilege source. It also grants org-manager permission when permission lookup throws or returns an error. | Remove metadata elevation; deny on permission lookup failure. Centralize canonical role checks. |
| S05 / High | Custom MFA is gated using browser storage in `AuthContext.tsx`. The verification endpoint returns success but does not establish a server-enforced elevated session; the API middleware checks a valid identity token without verifying this custom MFA completion. | Use Clerk MFA and enforce verified session claims where required. Remove the custom browser-only trust decision; test direct API requests before second-factor completion. |
| S06 / High | `apiSecurity.ts` accepts arbitrary `x-user-id` outside production, plus a hardcoded development bypass ID. | Require explicit isolated-development configuration, never merely absence of `NODE_ENV=production`; refuse these paths on deployed environments. |
| S07 / High | Live `get_complete_schema()` is executable anonymously: a valid anonymous key received HTTP 200 with approximately 651 KB of schema and function definitions. This function has no matching migration in the inspected repo. `users_roles` has a live SELECT policy for `anon, authenticated` using `true`; a zero-row request succeeds. No user-role rows were retrieved. | Restrict schema introspection and identity-role mapping access. Review function EXECUTE grants and all security-definer functions. Add reviewed migrations for intended metadata diagnostics. |
| S08 / High | Multiple identities and scopes coexist: `clients`, `vs_clients`, `organizations`, `access_control`, `memberships`, `org_users`, `org_members`, and `agents`. The live `org_role` enum has no `client` value. Legacy `agents` has a client FK but no authenticated user mapping. Existing `campaigns` is an email-campaign table without tenant ownership. | Define a canonical operational client/campaign/agent assignment model and immutable identity mapping. Do not repurpose the shared outreach `campaigns` table blindly. Add constrained operational campaign ownership and explicit client memberships. |
| S09 / High | `APIKeysPage.tsx` passes `isOrgAdmin={true}`. `OrgAPIKeysTab.tsx` queries all `org_api_keys` columns and expects `name` and plaintext `key`, but the live table contains `label` and `key_hash`. Its write policy currently permits organization members. | Admin-only key management; server-generated keys shown once; return an explicit safe response type, never hashes or credential material to clients. Fix field mapping and real permission checks. |
| S10 / High | `CallsPage.tsx` and `ReportPage.tsx` expose client-side CSV exports without the requested client export permission. `RecordingsPage.tsx` exposes download actions. SMS, number requests, team management, and billing actions do not implement the requested three-role model. | Introduce deny-by-default capabilities in both API/database access and UI. Remove client write/export controls unless explicitly enabled. RLS cannot prevent a user manually copying data they are legitimately permitted to read. |
| S11 / High | `LeadGenRedirectPage.tsx` forwards both access and refresh tokens in a URL fragment to a separately hosted application. | Replace with a short-lived, single-use, audience-bound handoff or a shared Clerk sign-in flow. Do not forward refresh tokens across applications. |
| S12 / High | `tests/rls-verification.js` and `scripts/verify-rls.js` do not test two real tenant sessions across every table. Some assertions incorrectly require permission errors where RLS SELECT normally returns an empty set; another uses obsolete `supabase.auth.user`. | Replace with meaningful SQL/RLS and API isolation tests against a disposable database, including denied writes and forbidden columns. Do not run mutation tests against production. |
| S13 / Medium | `schemaHealth.ts` checks RLS/policy existence for a subset of tables rather than policy semantics. Its overall security `ok` does not incorporate public-bucket findings. Its schema check attempts an UPDATE against a sentinel profile ID. | Make diagnostics genuinely read-only, audit every owned table/view/function, and distinguish intentional public brand assets from sensitive buckets. A healthy indicator must not mean only that a policy exists. |
| S14 / Medium | Live Storage has five buckets. `brand-assets` is public; the others are private. No monitoring screenshot bucket exists. Root `.env` includes a `VITE_SUPABASE_SERVICE_ROLE_KEY` variable name; tracked-source scanning found no secrets and actual bundle exposure was not established. | Keep branding public only intentionally; create a separate private monitoring bucket. Remove frontend-prefixed secret configuration and add a build-time secret-name/value leakage check. |

The full per-table policy inventory is in `database-inventory.json`. Phase 2 must explicitly classify all 175 tables as dashboard-owned, shared-service-owned, or intentionally service-only. A policy-less service-only table should not receive a broad user grant just to satisfy a policy-count check. Sensitive shared outreach tables should retain denial to dashboard clients and agents unless specifically authorized.

## Readability, behavior, and responsive findings

The existing reusable `PageLayout`, `Sidebar`, `DashboardPrimitives`, tables, status badges, loading skeletons, and error panels are useful foundations. They should be repaired and reused.

| ID | File / finding | Proposed fix |
| --- | --- | --- |
| U01 | `contexts/ThemeContext.tsx` forces light mode, ignores the requested mode, and removes the saved preference. `index.css` nevertheless contains dark selectors. | Restore an explicit working light/dark preference and test both, or explicitly agree to a light-only scope. This plan assumes both are supported. |
| U02 | `index.css`, `tailwind.config.cjs`, and `client/index.html` do not load Inter. Browser computed font is the system sans stack. Navy/violet tokens differ from the requested brand. The Next starter uses Geist. | Load Inter locally, define semantic brand/surface/text tokens, retain `#0A0F1E` and `#7B5CF6` as brand anchors, and use accessible variants for text and controls. |
| U03 | Exact brand violet on exact navy is **4.28:1**; white on exact violet is **4.46:1**. Both narrowly fail normal text's 4.5:1 requirement. | Use a lighter violet for body text on navy and a slightly darker violet behind small white button text. Do not round 4.46 up to a pass. |
| U04 | `DashboardPrimitives.tsx` section/empty headers and `DashboardNewV3.tsx` overview/panel headers retain `from-white` gradients when dark text overrides change text to very light colors. Forced dark screenshot confirms unreadable overview text. | Theme the complete foreground/background pair, including gradients. Replace broad utility overrides with component tokens. |
| U05 | `AdminTopNav.tsx` uses translucent `bg-slate-50/70`, which stays pale in forced dark mode while text becomes light. `Sidebar.tsx` and `PageLayout.tsx` avatars retain `bg-violet-100` with dark-mode `#DDD6FE` text, about **1.17:1**. | Add explicit dark surfaces and semantic avatar colors. Recheck composited glass backgrounds rather than only raw color tokens. |
| U06 | `pages/admin/OrgDashboardPage.tsx` light-mode KPIs use emerald-400, blue-400, purple-400, cyan-400, and orange-400 on light surfaces. Examples: emerald-400 on white **1.92:1**, blue-400 **2.54:1**, purple-400 **2.64:1**, all below 3:1 even for large values. | Use darker semantic chart/KPI colors in light mode, lighter ones in dark mode. Preserve status meaning with labels as well as color. |
| U07 | `AdminUsersPage.tsx` uses white small text on emerald-500, **2.54:1**. `AdminInviteCodesPage.tsx` uses white on cyan-600, about **3.68:1**. Light placeholder overrides in `index.css` use slate-400 on white, **2.56:1**. | Darken button backgrounds and placeholders; keep persistent input labels. |
| U08 | `index.css` primary/destructive buttons use gradients and disabled opacity. White on the primary gradient's lightest stop is **4.23:1**; this is a risk estimate, not proof that text lies on that exact pixel. | Measure actual text pixels at all gradient positions, hover/focus and disabled states; simplify gradients if needed. Disabled controls are usually exempt from WCAG contrast rules, but still must meet your stronger visibility requirement. |
| U09 | `index.css` input borders and focus rings use low-opacity grays/violet. Chart overrides use fixed colors and extensive `!important`. | Validate necessary control boundaries/focus indicators at 3:1 against adjacent colors. Validate chart series, axes, legends, tooltips, empty data, and non-color cues with populated fixtures. Decorative grid lines need not all meet 3:1. |
| U10 | `pages/admin/AdminDiagnosticsPage.tsx` has a `try/finally` without an error handler. A simulated 500 produced an unhandled rejection and the global overlay. | Catch errors, retain last good data with a stale label if appropriate, show the reusable error panel and retry. |
| U11 | `pages/admin/AdminNumberChangeRequestsPage.tsx` replaces failed requests with an empty list. The reproduced UI says “No requests found.” `NumbersPage.tsx` silently clears recordings on fetch failure. | Distinguish loading, failed, truly empty, and stale states. Preserve actionable error messages. |
| U12 | `SettingsPage.tsx` displays “Loading organization settings...” whenever no org exists, including platform admins and users with no assignment. Save errors only reach the console. Its audit insert uses `user_id`, but the live `audit_logs` column is `actor_id`; that insert result is not checked. | Add a terminal no-organization/error state and selection flow. Move settings changes and audit writes into one server/database transaction with the correct actor column. |
| U13 | `PageLayout.tsx` starts with “Sync online” and leaves it unchanged on non-OK HTTP responses. The failure fixture reproduced that label. `DashboardNewV3.tsx` treats absence of a live error as “Connected” and synthesizes refresh time. | Default to unknown; derive connection/staleness from explicit source health and actual provider timestamps. |
| U14 | `DashboardNewV3.tsx` fetches `limit=1000`, but API middleware caps GET limits at 100; hourly/status charts are built from those returned rows. The UI can mix partial chart data with whole-range totals. `reports.ts` also uses bounded scans for aggregates. | Compute scoped aggregates in SQL over the complete selected range or explicitly paginate all necessary records. Test datasets larger than the caps. |
| U15 | `DashboardNewV3.tsx` derives available agents as all agents minus active-call agents; unknown/offline status can therefore become “Available.” Its direction helper checks `in` before `internal`. | Use explicit provider-status categories and exact normalized direction mapping. Keep unknown separate. |
| U16 | `server/src/routes/reports.ts` converts date-only filter bounds to UTC midnight, while browser charts use local hours. | Convert viewer/client IANA-zone date boundaries to UTC explicitly, using half-open intervals; label the display zone and account for DST. |
| U17 | `UserSettingsPage.tsx` leaves API-key loading commented out with a migration TODO, while management UI remains. `OrgAPIKeysTab.tsx` presents any database error as a missing table. | Finish or hide unsupported functionality; distinguish permission, schema, and network errors. |
| U18 | `AdminTopNav.tsx` reads `user_metadata.role`, but `AuthContext` hydrates `user_metadata.global_role`. Other pages only recognize `platform_admin`, while route guards accept other admin aliases. `OrgContext.tsx` selects the first membership independently of selected organization. | Use one canonical role accessor and organization selection source. Verify all roles and multi-client assignments. |
| U19 | `client/index.html` enables a raw global exception overlay in production. | Keep detailed diagnostics in protected logs/dev tooling; present sanitized user errors through the existing boundary. |
| U20 | UI em dashes remain in `AgentsTab.tsx`, `OrgReportsTab.tsx`, `PlatformApiKeysTab.tsx`, `AdminUsersPage.tsx`, `admin/OrgDashboardPage.tsx`, and the three legacy Reports pages. | Replace visible placeholders with “Not available” or a simple hyphen; add a UI-copy check. Comments do not need rewriting. |
| U21 | `ReportPage.tsx` exports every scalar response field and both CSV helpers only escape quotes. Spreadsheet formula prefixes are not neutralized. | Use explicit approved export columns, permissions, full report scope, and spreadsheet-safe cell encoding. |
| U22 | Legacy routes `/leads/*`, `/crm/*`, `/sales/*`, `/admin/ai-qualification`, and `/dashboard/leads` redirect to the dashboard. There are no timer, timesheet, cap-management, or monitoring pages. | Clearly retire/redirect old destinations or restore the intended feature where authorized; add the requested operational routes in their build phases. No obvious `href="#"` placeholder navigation was found in the page-source scan. |

### Page coverage and proposed changes

Paths below are relative to `client/src/pages/`. Every active page inherits applicable shared theme, font, role, and layout findings above. “Shell checked” means the isolated empty-data browser render was exercised; it is not populated-data sign-off.

| Page file(s) | Coverage and next action |
| --- | --- |
| `LoginPage.tsx` | Shell checked. Repair environment/auth integration, input contrast, disabled/MFA states; verify real sign-in in staging. |
| `DashboardNewV3.tsx` | Shell checked and dark screenshot inspected. Fix U04, U13-U16; exercise populated charts and API failure combinations. |
| `CallsPage.tsx` | Shell checked. Restrict export, verify full pagination and populated mobile table, accessible filters and recording actions. |
| `LiveStatusPage.tsx` | Shell checked. Theme empty/section panels; enforce assigned-agent scope and accurate stale/unknown indicators. |
| `NumbersPage.tsx` | Shell/error checked. U11; remove client provisioning/sync writes under the requested role model. |
| `ReportPage.tsx` | Shell checked at `/reports` and `/admin/reports`. Fix export permissions, data completeness, time zones, and dark sections; test each report tab. |
| `RecordingsPage.tsx` | Shell checked. Review download capability and payload fields; test media errors, expiry and CSP. |
| `SMSPage.tsx` | Shell checked, including admin redirect. Sending SMS conflicts with read-only client scope; enforce authorized roles and theme compose dialog. |
| `SupportPage.tsx` | Shell checked. Creating/replying is a write, so remove from client capability unless you approve an explicit exception; test dialog errors. |
| `BillingPage.tsx` | Shell checked. Subscription/payment actions conflict with literal read-only client access; decide capabilities explicitly and fix dark cards. |
| `TeamPage.tsx` | Shell checked through `OrgMembersTab`. Enforce assigned-agent-only reads and admin-only membership management; show organization errors. |
| `SettingsPage.tsx` | Shell/error checked. Fix U12 and U18. |
| `UserSettingsPage.tsx` | Shell checked. Fix U17, finish Clerk account/MFA migration, and explicitly separate personal account settings from operational client writes. |
| `APIKeysPage.tsx` | Direct load fails locally due to proxy prefix. Source/component reviewed; fix A06 and S09 before rechecking populated key management. |
| `EmailPreferencesPage.tsx` | Shell checked at both ordinary/admin URLs. Client must not manage other users' preferences; repair dark shared sections. |
| `DebugAuthPage.tsx` | Shell checked; route already admin guarded. Keep diagnostics restricted and avoid exposing auth internals unnecessarily. |
| `LeadGenRedirectPage.tsx` | Source reviewed; automatic external handoff deliberately not executed with real credentials. Replace token handoff per S11. |
| `OrgManagePage.tsx` | Shell checked; source tabs reviewed. Recheck membership, key, settings, reports, agent and phone tabs after role unification. |
| `admin/OrgDashboardPage.tsx` | Shell checked. Fix seven light-mode contrast candidates, U16 and em dash placeholders; align layout with existing shell. |
| `admin/AdminUsersPage.tsx` | Shell checked. Fix button contrast, role choices, immutable Clerk mapping, error feedback, em dashes. |
| `admin/AdminAgentsManagementPage.tsx` | Shell checked. Add actual user/client/campaign assignments; test populated editing table at mobile widths. |
| `admin/AdminOrgsPage.tsx` | Shell checked. Retain working org management; replace alert-only failures, unify canonical client scope. |
| `admin/AdminOrgOverviewPage.tsx` | Shell checked. Validate aggregate completeness and distinguish no organizations from load failure. |
| `admin/AdminOperationsPage.tsx` | Shell checked. Review role/tenant actions and all nested editing states; reuse corrected inputs and status tokens. |
| `admin/AdminDiagnosticsPage.tsx` | Shell/error checked. Fix U10 and semantic security health reporting. |
| `admin/AdminLogsPage.tsx` | Shell checked. Make audit history append-only, validate filters, restrict private payloads, and test long log rows. |
| `admin/AdminApiKeysPage.tsx` | Shell checked via platform key component. Keep admin-only; fix shared dark nav and plaintext-once key handling. |
| `admin/AdminMightyCallPage.tsx` | Shell checked. Theme dark sections; verify credential save, provider errors and webhook capabilities in staging. |
| `admin/AdminSupportPage.tsx` | Shell checked. Theme detail/empty panels; verify failure/retry and tenant associations. |
| `admin/AdminNumberChangeRequestsPage.tsx` | Shell/error checked. Fix U11; replace generic browser alerts with actionable errors. |
| `admin/AdminInviteCodesPage.tsx` | Shell checked. Fix cyan button contrast and move invitations to the canonical Clerk/role model. |
| `admin/AdminRecordingsPage.tsx` | Shell checked. Existing authenticated download proxy is worth retaining; test expiry, tenant checks, and dark panels. |
| `admin/AdminBillingPageV2.tsx` | Shell checked. Preserve working billing; theme modal controls and enforce admin-only writes/exports. |
| `Dashboard.tsx`, `DashboardV2.tsx` | Legacy alternatives not mounted by current router. Source reviewed; do not treat their code as the deployed dashboard. Archive only after import checks. |
| `ReportsPage.tsx`, `ReportsPageEnhanced.tsx`, `ReportsPageFixed.tsx`, `admin/AdminReportsPage.tsx` | Legacy report alternatives, not the routed `ReportPage`. Source reviewed; retire duplication, stale styling and em dash placeholders rather than separately redesigning unused screens. |
| `AdminOrgsPage.tsx`, `AdminSupportPage.tsx`, `PhoneAssignmentsPage.tsx`, `admin/AdminBillingPage.tsx`, `admin/OrgOperationsPage.tsx` | Not mounted by the current route configuration. Source reviewed; determine retained imports before archiving. |
| `my-clerk-app/app/page.tsx`, `layout.tsx`, `globals.css`, `proxy.ts` | Separate starter builds but has template copy, Next/Vercel links and Geist. It is not an implemented BPO dashboard or role system. |

### Mobile/tablet limits

The tested empty shells did not overflow the document at 390/768/1440 px. Still outstanding: populated wide tables, long agent/client names, on-screen keyboards, modal scrolling, menu focus, 200% zoom, touch controls, and chart readability. The organization selector in `PageLayout.tsx` is hidden below `md`; ensure admins have an accessible mobile selector on every relevant page. Use the existing table containers and responsive shell, not a new layout system.

## Transfer readiness and MightyCall feasibility

Existing foundations: `call_transfers`, call-event ingestion/webhooks, `server/src/mightycall/sync.ts`, its normalizers, reporting endpoints, and report/dashboard transfer summaries. Leads already contain state, debt amount, notes, and some assignment/campaign fields. Reuse these after resolving ownership.

The live transfer table has organization, external call/transfer IDs, extensions, numbers, type, target, raw payload, timestamps and provider result/status. It lacks the requested canonical agent/client/campaign associations, lead qualification snapshot, notes, and four normalized business outcomes.

MightyCall's published specification includes an incoming-transfer example represented by a sequence of agent ringing/connected/completed events sharing a call ID. It also documents consultant-call sequences. Therefore, automatic capture is feasible, but a second agent joining is not sufficient proof of a completed transfer. Account-specific outbound/external-transfer behavior still needs captured staging samples. There is no standalone transfer REST path in the inspected spec; calls and call details are the relevant API resources. See [MightyCall API documentation](https://ccapi.mightycall.com/v4/doc) and its [published specification](https://ccapi.mightycall.com/v4/api/swagger/docs/v4).

Two concrete code issues in `sync.ts`: transfer upsert ignores the returned database error, and its synthesized ID is call + target + type, which can collapse repeated transfers to the same target. It also falls back to the original call's start time as transfer time. Correct those before trusting counts.

Recommended design: retain raw provider evidence separately; reconcile ordered call legs into canonical transfer attempts; deduplicate by provider event/attempt identity; quarantine ambiguous ownership; offer a fast prefilled agent form for qualification, notes, callbacks, disqualification and unsupported/ambiguous provider events. Do not fabricate lead qualification from telephony metadata.

## Phased build plan for approval

### Phase 1: Readiness and readability repairs

1. Resolve the actual application target and configuration mismatch. Recommended baseline: existing Vite/React + Express with a completed Clerk integration in Phase 2. Treat Next.js conversion as separately approved work if required.
2. Establish reproducible build/typecheck/test commands and a staging environment using isolated data. Reconcile migration ordering and shared-database ownership without applying production changes.
3. Repair the shared theme primitives, load Inter, implement brand-aware accessible light/dark tokens, then fix page-specific exceptions. Remove visible em dashes.
4. Fix dead local route loading, error/empty/stale states, incorrect key schema expectations, indefinite settings loading, and misleading operational metrics.
5. Add populated, empty, loading, failed and permission-denied fixtures; measure text/control/chart contrast and responsive behavior across the page matrix, including dialogs and disabled states.

**Exit:** client/server builds and client typecheck pass; affected meaningful tests pass; verified contrast/layout evidence and a list of any remaining blocked real-account checks. Your testing: login flow, theme switching, phone/table filters, report dates, error retry, mobile menus and modals. No Phase 1 release should expose the known authorization defects.

### Phase 2: Clerk identity and database-enforced permissions

1. Link Clerk subjects to existing internal users with unique immutable mappings. Preserve UUID relationships initially; avoid a blanket auth-user FK rewrite. Configure Supabase's supported Clerk third-party integration and token-based request clients. Its documented integration secures database, Storage and Realtime with Clerk session tokens. See [Supabase's Clerk guide](https://supabase.com/docs/guides/auth/third-party/clerk).
2. Keep the JWT database role `authenticated` distinct from application roles `admin`, `agent`, and `client`. Do not promote a Clerk `org:admin` to Victory Sync admin.
3. Define canonical clients, operational campaigns, client-user memberships and dated agent/client/campaign assignments. Separate pay-rate records and secret integrations from client-readable data. Default client export and screenshot access to off; pay rates remain admin-only under this proposed plan.
4. Write versioned migrations replacing existing permissive policies on every affected table. Add composite foreign keys/checks to prevent a campaign/agent/client relationship from being mixed across clients. Include views, RPC grants, Storage objects and Realtime, not just base-table SELECT.
5. Use RLS-bound database requests for normal API access. Privileged RPCs must validate the actor and input, fix `search_path`, constrain EXECUTE privileges, and audit admin changes. Remove fail-open checks and unsafe role sources.
6. Inventory all 175 existing tables. Establish explicit deny-by-default treatment for unrelated service-owned tables; coordinate any shared-service policy changes before deployment.

| Resource | Admin | Agent | Client |
| --- | --- | --- | --- |
| Client/campaign configuration and assignments | Manage | Read own assignments | Read own authorized scope |
| Time sessions, breaks and limits | Manage/review | Read own; controlled clock/break operations | Read assigned agents' hours for own campaigns |
| Transfers | Manage | Read/log own assigned work | Read own campaigns only |
| Hour overrides and edit audit | Create/read, append-only history | Read own applicable results | No administrative access |
| Pay rates, secrets, role grants | Admin only | No access unless separately specified | No access |
| Screenshots/activity | Manage under policy | Read own | No access by default; screenshot access only if explicitly enabled per client |
| Reports/export | Scoped administrative CSV/PDF | Own permitted data only; export off by default | Read own scope; export off by default |

**Proof required:** disposable test users Admin, Agent A/B, Client A/B, unassigned user, and anonymous. For every table test permitted and forbidden SELECT, INSERT, UPDATE, DELETE; own-client writes must fail too. Include guessed IDs, changed tenant/owner fields, nested joins, views/RPCs, aggregate totals, service-backed API routes, direct REST, protected columns, membership/role self-escalation, revoked assignments, signed-file URLs, and Realtime subscriptions. Seed fixtures only in isolated test infrastructure. Confirm denied mutations have not changed rows.

**Exit:** migration reset/replay and isolation tests pass; no client can read another client's data, write operational records, access pay rates, or obtain unauthorized screenshot URLs. Your testing: three-role walkthrough and attempted cross-client URLs. Production migrations remain separately approval-gated.

### Phase 3: Canonical live transfer tracking

1. Extend the existing transfer model with authenticated agent, operational client/campaign, lead reference and qualification snapshot, normalized phone/state, occurrence time, four outcomes, notes, source, and immutable provider correlation IDs. Use migrations and constraints.
2. Extend the existing webhook inbox/normalizers with authenticated ingestion, idempotency, ordering, retry, reconciliation, and ambiguity handling. Distinguish transfer attempts from consultations/conferences and originating-call completion.
3. Add the fast agent form with client/campaign constrained to current assignments, prefilled call/lead details, minimal required fields, and keyboard access. Persist one canonical record if agent entry later matches a provider event.
4. Add scoped per-agent/client/campaign day/week/month totals, connected transfers / eligible transfer attempts, and transfers per worked hour once Phase 4 supplies trustworthy hours. Display unavailable before the denominator exists, never fabricated zero-hour rates.

**Exit:** duplicate, reordered, repeated-target, missed-event, failure, consultant-call, and manual/provider-match fixtures pass; builds and isolation tests pass. Your testing: connected, no-answer, callback and disqualified examples, agent attribution, and client-scoped totals.

### Phase 4: Time tracking and caps

1. Add sessions, work/break segments, limit rules, overrides, review status and append-only change history. Reuse the audit architecture only after making it trustworthy. Each session has a client/campaign and agent. Prevent overlapping active sessions.
2. Implement clock-in, pause, resume and clock-out as server/database transactions. Lock/check the agent and applicable caps atomically. A browser interval is display-only.
3. Apply daily/weekly agent and optional agent/client caps, with the most restrictive applicable cap winning. Notify at 80% and 95%. At 100%, server-side effective stop time and a durable scheduler end work and block new work. Do not depend on an open tab or Express in-memory timer.
4. Record each override's admin, time, reason, scope, allowance and expiry. Agent actions cannot edit totals, approval state, caps or override audit history.
5. Store UTC timestamps. Proposed cap accounting default is `Africa/Cairo`, Monday-start weeks; use `America/New_York` for Eastern client reporting when selected. Display in the viewer's IANA time zone. Split accounting at actual zoned day/week boundaries and handle DST and overnight work. The viewer changing display zone must never reset caps.
6. Implement configurable idle flags/auto-pause. Before the desktop app exists, browser inactivity only measures the dashboard, not system-wide work. Label that limitation and avoid treating a phone conversation as idle merely because no keys were pressed.
7. Add admin edit/approve/reject with mandatory reasons, before/after values and recomputed cap usage. Export admin CSV/PDF; clients receive read-only approved/scoped hours and no rate data.

**Exit:** concurrency, duplicate clicks, multiple tabs/devices, lost connection, crash recovery, DST/midnight/week transitions, exactly-at-cap, overlapping caps and override tests pass. Your testing: 80/95/100% thresholds, breaks, override/review, report totals and viewer-zone switching.

### Phase 5: Windows desktop tracker

Recommend **Tauri 2 with a React interface and a narrowly scoped Windows native backend**, reusing present UI patterns. Tauri uses the system WebView and supports explicit capability boundaries, making it a suitable lightweight starting point. Native screenshot/input work still needs a Windows feasibility spike and installer testing; this is not supplied automatically by Tauri. See [Tauri process model](https://tauri.app/concept/process-model/) and [capabilities](https://v2.tauri.app/security/capabilities/).

1. Sign in through Clerk using the system browser and a one-time, short-lived session handoff. Store credentials in Windows-protected storage. Ship no Supabase service key in the tracker.
2. Require a versioned first-launch disclosure acceptance with server timestamp. Show a persistent tracking indicator, tray status and clear clock/break controls. Agents can inspect their own captured data.
3. Capture only during a server-authorized active work session. Stop immediately on break/clock-out/cap expiry and on lock/suspend/sign-out. Recheck session authorization immediately before capture/upload to close race conditions. On lost authorization/lease, stop collecting until authorization returns; define queued-data handling explicitly.
4. Count keyboard events, mouse clicks and movement events per minute in memory. Never store key identities, text, clipboard contents, coordinates, or raw input-event histories. Transmit minute aggregates only. Keep optional app/window titles behind a separate admin toggle and disclosure.
5. Schedule screenshots randomly within configured bounds, for example 5-10 minutes. Apply configured blur on the device before upload. Screenshots can themselves contain sensitive visible content, even with count-only input monitoring; disclose this clearly and make capture policy visible.
6. Use a private screenshot bucket and short-lived signed URLs issued only after actor/client/assignment checks. Client screenshot access defaults off and must be explicitly enabled per client. Prevent cross-client captures from leaking when agents switch campaigns. Keep permissions separate from general report access.
7. Define activity score as active work minutes with counted input divided by eligible work minutes; exclude breaks and distinguish missing/offline data from zero activity. Show it alongside the time entry without implying it measures work quality.
8. Add configurable retention, a durable deletion job, retries and deletion receipts. Delete both screenshot objects and expired metadata as applicable; test that objects become inaccessible, not merely hidden. Include queued local files and backup retention in the operational policy.
9. Package a signed Windows installer with restricted IPC/capabilities and signed updates. Test multi-monitor/high-DPI capture, sleep/resume, lock, crashes, offline behavior and uninstall.

**Exit:** Windows package/build plus web/server builds pass. Tests prove no capture during break/off-clock/expired sessions, no typed-content payloads, agent-own visibility, client gating, signed URL expiry and actual retention deletion. Your testing: two controlled work sessions, break/lock behavior, disclosure, blurred screenshots, activity totals, and retention in staging.

## Approval and remaining verification

No implementation has started. The immediate approval is for this scope and phase order, including the recommendation to retain the existing Vite/Express application while completing Clerk. If Next.js is mandatory, include the explicit migration track in that approval.

Defaults proposed for review: both themes supported; clients have no operational writes or exports; sensitive pay rates admin-only; screenshot sharing off per client; hour-cap periods use Cairo time and Monday-start weeks. Personal account settings can remain self-service if you approve that narrow exception to literal client read-only access. Business-data creation, SMS, billing changes and support replies are not assumed exceptions.

Before security sign-off, confirm the deployed Vercel/backend/Clerk instances, inspect Supabase third-party-auth settings and SQL grants/views, replay migrations in an isolated environment, and exercise real Admin/Agent/Client sessions against staging. Before production changes, I will present the concrete migration/release result and ask for the separate approval you required. After each approved build phase, I will run the relevant builds/tests, fix failures, and report what changed and what you should test.
