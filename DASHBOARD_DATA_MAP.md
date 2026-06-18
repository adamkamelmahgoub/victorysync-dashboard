# VictorySync Dashboard Data Map

This map documents the production data contract for the redesigned dashboard. UI sections should use these endpoints and shared metric utilities instead of hardcoded values or mock data.

## Auth And App Shell

| Area | Data source | Endpoint/API | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- |
| Login | Supabase Auth | `supabase.auth.signInWithPassword` | `email`, `password` | Public | Inline form error | Frontend no longer depends on Clerk. Auth session is restored from Supabase on refresh. |
| Current user/profile | Supabase Auth + `users`/org membership tables | `/api/user/profile`, `/api/user/orgs` | user id, email, role, org ids | Authenticated users | Protected routes show skeleton while hydrating, then redirect to `/login` | API requests attach the Supabase access token server-side. |
| Sidebar/topbar | Auth context | `/api/user/profile`, org context from auth provider | role, feature access, selected org | Role-gated | Hide unauthorized nav links | Sidebar IA now uses one link per primary page to avoid duplicate-content routes: Overview, Live Status, Reports, Calls, SMS, Recordings, Agents, Phone Numbers, Organizations, Users, Ops Console, Billing, MightyCall, API Keys, Invites, Support, Number Requests, Diagnostics, Logs, and Settings. Query-tab destinations remain reachable inside their parent pages. |
| Stripe billing | Stripe Checkout, Billing Portal, card payments, subscription setup, webhooks + Supabase billing tables | `/api/billing/stripe/plans`, `/api/billing/stripe/plan-price`, `/api/billing/stripe/checkout-session`, `/api/billing/stripe/payment-session`, `/api/billing/stripe/portal-session`, `/api/billing/stripe/webhook` | `billing_plans.stripe_product_id`, `billing_plans.stripe_price_id`, `org_subscriptions.stripe_customer_id`, `org_subscriptions.stripe_subscription_id`, `invoices.stripe_invoice_id`, `invoices.amount_due`, `invoices.amount_paid`, `billing_records.stripe_*`, `payment_transactions.stripe_payment_intent_id` | Org billing managers/admins; Stripe plan-price setup is platform-admin only; webhook is public but signature verified | Plan cards show missing Stripe price state; admin packages can create Stripe recurring prices; invoices show card payment action only when payable; webhook returns signature/config errors | Added hosted subscription Checkout, admin Stripe recurring price creation, one-time card payment Checkout for invoices/custom charges, Stripe Billing Portal launch, webhook sync for subscriptions/invoices/payments, and migration `supabase/032_stripe_billing_integration.sql`. |
| Email preferences | Notification preference service + Supabase preference table | `/api/notification-preferences/me`, `/api/admin/notification-preferences`, `/api/admin/notification-preferences/:userId` | `notification_preferences.user_id`, `email`, category booleans, `org_id` | Users can manage their own safe categories; platform admins can manage every user | Clean empty/error states; missing table is surfaced by API errors until migration is applied | Client defaults are limited to billing, payment, account, and organization emails. Dashboard-update emails are sent only to platform admins and filtered by preference. Migration `supabase/migrations/032_notification_preferences.sql`. |

## Overview

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KPI: Total calls | Reporting aggregate | `/api/reports/overview` | calls/reporting tables | `totalCalls` or call rows | Platform admin all orgs, client scoped to org | Show zero/empty state only when API returns no data | No fallback fake totals. |
| KPI: Answered calls | Reporting aggregate | `/api/reports/overview` | calls/reporting tables | answered count/status | Same as above | Same as above | Shared status normalization in `reportingMetrics.ts`. |
| KPI: Missed calls | Reporting aggregate | `/api/reports/overview` | calls/reporting tables | missed/abandoned/failed counts | Same as above | Same as above | Shared missed-call normalization. |
| KPI: Transfers | Reporting aggregate + call metadata | `/api/reports/overview`, `/api/reports/transfers` | calls/transfers data | transfer count/status/metadata | Same as above | Same as above | Shared transfer detector. |
| KPI: Average handle time | Reporting aggregate/call durations | `/api/reports/overview` | calls/reporting tables | duration seconds | Same as above | Same as above | Shared duration formatter. |
| KPI: Answer rate | Derived from answered/total | `/api/reports/overview` | calls/reporting tables | answered, total | Same as above | Same as above | Shared answer-rate utility. |
| KPI: SMS count | Reporting aggregate | `/api/reports/overview`, `/api/reports/sms` | sms/messages table | total SMS count | Same as above | Same as above | Direction normalization handled in shared utility. |
| KPI: Recordings available | Reporting aggregate/recording rows | `/api/reports/overview`, `/api/reports/recordings` | call recordings table | recording URL/id/flag | Same as above | Helpful empty state when no recordings exist | Shared recording availability helper. |
| KPI: Active agents/live agents | MightyCall/live status service | `/api/live-status` | MightyCall API/cache | agent id/name/extension/status | Same as above | Show unknown/offline instead of blank | Polling flow avoids UI flicker. |
| Charts: calls by hour/status/number/direction/agent | Reporting series/aggregate | `/api/calls/series`, `/api/reports/overview`, `/api/reports/agents` | calls/reporting tables | timestamp, status, number, direction, agent | Same as above | Chart empty state if no rows | No generated chart values. |

## Reports

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Filter options | Reporting metadata | `/api/reports/numbers`, `/api/admin/orgs` for admins | phone numbers/orgs | number, org id/name | Admin all orgs, clients own org only | Disable unavailable filters | Org selector is admin-only. |
| KPI summary | Reporting aggregate | `/api/reports/overview` | reporting tables | calls, answered, missed, transfers, duration, sms, recordings | Role scoped server-side | KPI empty state | Uses shared metric utilities. |
| Calls table | Report rows | `/api/reports/calls` | calls table | timestamp, direction, from, to, status, duration, recording id/url | Role scoped server-side | Empty table state | Export should use same scoped filters. |
| SMS table | Report rows | `/api/reports/sms` | sms/messages table | timestamp, direction, from, to, message, status | Role scoped server-side | Empty table state | SMS direction normalized. |
| Transfers/agents/recordings | Report rows | `/api/reports/transfers`, `/api/reports/agents`, `/api/reports/recordings` | calls/agents/recordings | transfer metadata, agent, recording URL/id | Role scoped server-side | Empty table state | No placeholder metrics. |

## Calls

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Call log table | Report rows | `/api/reports/calls` | calls table | date/time, direction, from, to, assigned number, extension, status, duration, transfer status, recording id/url, org id | Platform admins global, clients own org | Clean empty/error states | Recording links go through authorized download endpoint. |
| Recording download | Backend proxy | `/api/recordings/:id/download` | recordings table + MightyCall | recording id, user/org access | Authenticated scoped users | Friendly error if unavailable | Prevents raw unauthorized recording access. |

## SMS

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SMS table | Report rows | `/api/reports/sms` | sms/messages table | timestamp, direction, from, to, assigned number, message preview, status, org id | Platform admins global, clients own org | Empty state explains no SMS for selected filters | Direction falls back to owned-number detection when provider direction is missing. |
| Assigned numbers | Phone number service | `/api/admin/phone-numbers` for admins, org phone-number API for clients | phone numbers table | number, org id | Role scoped | Filter disabled if none | Used for filtering and direction normalization. |

## Recordings

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recording list | Reporting rows | `/api/reports/recordings` | recordings/calls tables | call time, from, to, agent/extension, duration, status, recording id/url, org id | Role scoped | Helpful empty state if no recording URLs are available | No fake recording rows. |
| Recording sync | MightyCall integration | `/api/mightycall/sync/recordings` | MightyCall API + stored recordings | authorized admin, date range | Admin/sync-authorized users only | Show sync error without stack trace | Sync trigger remains protected. |
| Audio/download | Backend proxy | `/api/recordings/:id/download` | recordings table | recording id, org/user access | Role scoped | Link/player hidden if unavailable | URLs are not treated as public authorization. |
| Background recording sync | MightyCall scheduler | background `syncMightyCallRecordings` + `syncCallDetails` | recordings/calls tables | org id, phone ids, rolling date range | Server-side only | Existing rows remain visible if API fails | Runs on configurable interval without UI clicks. |

## Live Status

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent status board | MightyCall polling/cache | `/api/live-status` | MightyCall API/cache/users/extensions | agent name, extension, status, current call number, call started, last updated, org id | Admin global, clients own org, agents own extension if supported | Unknown/offline status instead of blank | Polling uses API fetch and keeps prior rows while refreshing to avoid flicker. |
| Sync health chip | Background sync status | `/api/mightycall/sync/status` | in-memory scheduler status + sync runs | last sync timestamps, running lanes, intervals | Authenticated users | Shows Sync pending if status cannot load | Topbar reflects live background sync state instead of static copy. |

## Agents

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent management | Users/org membership + live status | `/api/admin/users`, `/api/admin/org_users`, `/api/live-status` | users, org_users, extensions | name, email, role, org, extension, assigned number, live status | Admin/manager scoped | Empty table if no agents | Role actions remain permission based. |
| Team page | User/org membership | `/api/user/orgs`, profile APIs | users/org_users | user id, role, org | Client/org users | Empty state when team data not available | No admin-only data on client route. |

## Phone Numbers

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Number inventory | Phone-number service | `/api/admin/phone-numbers`, org phone-number API | phone_numbers | number, label, org id, status, call volume, sms volume, last activity | Admin global, clients own assigned numbers | Empty state when no assigned numbers | Client users cannot query other org numbers server-side. |

## Organizations

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Organizations table | Admin org service | `/api/admin/orgs`, `/api/admin/org-metrics` | organizations, users, phone_numbers, reports | org id/name/status, members, numbers, calls, sms, recordings, billing status | Platform admins only | Empty state if no organizations | Route and API remain admin protected. |
| Org detail | Admin org service | `/api/admin/orgs/:orgId`, `/api/admin/orgs/:orgId/phone-numbers`, `/api/admin/orgs/:orgId/users` | org scoped tables | org id, phone numbers, members | Platform admins only | Helpful errors for missing org | Query param tampering remains server-scoped. |

## Billing

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Client billing overview | Billing service | `/api/client/billing/overview`, `/api/client/billing/invoices`, `/api/client/billing/records` | billing tables | plan/package, invoices, payment status, usage, seats | Client scoped to own org | Clean "billing not configured" state | No fake invoices. |
| Admin billing | Billing admin service | `/api/admin/billing/records`, `/api/admin/billing/invoices`, `/api/admin/billing-packages`, `/api/admin/orgs`, `/api/admin/users` | billing/admin tables | records, invoices, packages, orgs, users | Platform admins only | Empty state when billing records absent | Export endpoints must use same RBAC. |
| Invoice reminder email | Backend notification service | `POST /api/admin/billing/invoices/:id/reminder` | invoices, invoice_items, org_members/org_users/profiles | invoice id, org id, status, totals, recipient emails | Platform admins only | Returns skipped reason when email env is disabled/missing | Sends only operational invoice metadata; no card data or request payloads. |
| Stripe payment/subscription emails | Stripe webhook sync | `/api/billing/stripe/webhook` | invoices, billing_records, org_subscriptions, org_members/org_users/profiles | Stripe event, org id, invoice number, amount/status | Stripe signed webhook only | Webhook still succeeds if email is skipped | Email hooks run after DB sync and do not expose Stripe secrets. |
| Dashboard update emails | API mutation middleware | Successful `POST/PUT/PATCH/DELETE /api/*` when enabled | org_members/org_users/profiles | method, path, actor id, org id, status code | Authenticated routes after auth/CSRF | No-op unless email notifications are enabled | Sanitized metadata only; request bodies and secrets are never emailed. |

## Settings

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account settings profile | User/profile service | `GET /api/user/profile`, `PUT /api/user/profile` | users/profile storage | full name, email, phone number, selected org id | Authenticated user | Loading message while fetching, inline success/error alert | Light settings cards and labeled inputs. Does not display secrets. |
| Profile picture | User upload service | `POST /api/user/upload-profile-pic` | profile storage | image data, user id | Authenticated user | Button disabled until image selected, inline error if upload fails | Uses user-selected image only; no fake avatar URL is generated. |
| Organization logo | User/org upload service | `POST /api/user/upload-org-logo` | organization/profile storage | image data, selected org id | Authenticated org user/admin | Button disabled unless an organization and image are selected | No API secrets are displayed. |
| Password change | User auth service | `POST /api/user/change-password` | auth provider/user credentials | current password, new password | Authenticated user | Inline validation for mismatch/short password; API error shown in page | Password values are never logged or rendered. |
| Organization settings | Supabase client update + audit insert | `organizations` update via Supabase, `audit_logs` insert | organizations, audit_logs | name, timezone, SLA target, escalation email, business hours | Org admin only for saving; read scoped by org context | Loading card when org is absent, save button hidden for non-admins | Shows only real organization settings; business-hours unavailable state is explicit. |
| API keys/settings | Admin key services | `/api/admin/api-keys`, `/api/admin/users/:id/api-keys`, MightyCall settings APIs | API key metadata only | key id/name/status, masked value | Owner/admin by role | Empty state when no keys | Secrets must stay server-only and masked in UI. Disabled account-level key UI was removed from the rendered settings surface. |

## Security And Audit Logs

| Section | Data source | Endpoint/API | DB table/view if known | Required fields | Role visibility | Empty/failure behavior | Notes/fixes applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin logs KPIs | Admin observability API | `/api/admin/logs/summary` via `getAdminLogsSummary` | audit/activity/pageview/error/API/auth log tables | total events, active users, unresolved errors, average API response, failed logins | Platform/admin roles only | Permission alert for unauthorized users, zero values only when API returns zero | Values are real API summary fields, not placeholders. |
| Admin logs table | Admin observability API | `/api/admin/logs/:tab` via `getAdminLogs` | audit/activity/pageview/error/API/auth/session tables | event, user, org, timestamp, endpoint, status, metadata by tab | Platform/admin roles only | Empty row when no logs match filters, inline API error if fetch fails | Light table shell, export uses currently returned scoped rows. |
| Admin logs filters | Admin observability API query params | `/api/admin/logs/:tab?start_date=&organization_id=&event_type=&resolved=&search=` | log tables | date range, org id, search, event type, resolved flag | Platform/admin roles only | Filtered empty state if no rows | Live refresh keeps using the same scoped filters. |

## Shared Calculation Utilities

The canonical frontend helpers live in `client/src/lib/reportingMetrics.ts`:

- `countTotalCalls`
- `countAnsweredCalls`
- `countMissedCalls`
- `countTransfers`
- `answerRate`
- `calculateAnswerRateFromRows`
- `averageHandleTimeSeconds`
- `normalizeCallStatus`
- `normalizeCallDirection`
- `normalizeSmsDirection`
- `normalizeLivePresenceStatus`
- `countRecordingsAvailable`
- `hasRecording`
- `filterRowsByDateRange`
- `formatPhoneNumber`
- `formatSeconds` / `formatDuration`
- `formatPercent`

Backend reporting endpoints remain the source of truth. These utilities are only for consistent display, fallback derivation from returned rows, and shared formatting.
