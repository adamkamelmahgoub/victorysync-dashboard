# VictorySync Dashboard Audit

Last reviewed: 2026-06-17

## Stack And Structure

- Frontend: React 18, Vite, TypeScript, React Router, Tailwind CSS, Recharts.
- Backend: Node/Express, TypeScript, Supabase service client, Zod/security middleware, MightyCall integration modules.
- Auth provider: Supabase Auth on the client; API requests are authenticated by Supabase session token and compatibility `x-user-id` handling where legacy endpoints still require it.
- Database: Supabase/Postgres. Main tables referenced by dashboard flows include `organizations`, `profiles`, `org_users`, `org_members`, `phone_numbers`, `org_phone_numbers`, `calls`, `mightycall_recordings`, `mightycall_sms_messages`, `call_transfers`, billing tables, support tables, lead tables, and audit/log tables.
- Backend middleware: `apiKeyAuthMiddleware`, Clerk/Supabase session compatibility middleware, API input validation/sanitization, rate limiting, request logging, authenticated API enforcement, and CSRF protection for authenticated mutations.

## Routing Setup

Routes are defined in `client/src/main.tsx` with lazy-loaded pages.

- Public: `/login`
- Protected workspace: `/`, `/dashboard`, `/calls`, `/live-status`, `/numbers`, `/reports`, `/recordings`, `/sms`, `/billing`, `/team`, `/account-settings`, `/settings`, `/support`, `/leads`
- Admin protected: `/admin`, `/admin/users`, `/admin/agents-management`, `/admin/orgs`, `/admin/orgs/:orgId/dashboard`, `/admin/operations`, `/admin/org-overview`, `/admin/diagnostics`, `/admin/logs`, `/admin/api-keys`, `/admin/mightycall`, `/admin/support`, `/admin/number-change-requests`, `/admin/invites`, `/admin/reports`, `/admin/recordings`, `/admin/billing`
- Org admin protected: `/orgs/:orgId/manage`

Route protection:

- `ProtectedRoute` requires an authenticated user and waits for organization context.
- `AdminRoute` requires platform/admin role and redirects non-admin users to client-safe routes.
- `FeatureRoute` hides client routes when database-backed feature access is disabled.

## Login Flow Review

- Login page: `client/src/pages/LoginPage.tsx`
- Auth context: `client/src/contexts/AuthContext.tsx`
- Supabase client: `client/src/lib/supabaseClient.ts`
- Session restore: `supabase.auth.getSession()`
- Login: `supabase.auth.signInWithPassword()`, then `hydrateUserContext()`
- Profile/org load: `/api/user/profile`, `/api/user/orgs`
- Feature access: `/api/me/features`
- Redirect: role-aware after hydrated auth state is available.
- Previous break risk fixed: sign-in no longer redirects from stale `globalRole` before profile hydration is committed.
- Tab-switch loading issue fixed: `TOKEN_REFRESHED` and `INITIAL_SESSION` events no longer force full app loading.

## Design System

Shared shell and primitives:

- App shell/topbar/sidebar: `client/src/components/PageLayout.tsx`, `client/src/components/Sidebar.tsx`
- Page header: `DashboardShellHeader`
- KPI card: `MetricStatCard`
- Chart card: `ChartCard`
- Data table: `DataTable`
- Filter bar: `FilterBar`
- Search input: `SearchInput`
- Date range selector: `DateRangeSelector`
- Empty state: `EmptyStatePanel`
- Error state: `ErrorStatePanel`
- Loading skeleton: `LoadingSkeleton`
- Badge/status pill: `StatusBadge`
- Buttons/forms/surfaces: `client/src/index.css` classes `vs-button-primary`, `vs-button-secondary`, `vs-input`, `vs-surface`, `vs-surface-muted`

Visual direction now uses a light neutral background, white cards, soft gray borders, compact controls, restrained VictorySync violet accents, responsive sidebar/mobile navigation, and clean table hover states.

## Primary Page Data Map

| Page | Route | Main endpoints | Primary real data |
| --- | --- | --- | --- |
| Login | `/login` | Supabase Auth, `/api/auth/validate-invite`, `/api/auth/signup-with-invite`, `/api/user/profile`, `/api/user/orgs` | Auth session, profile, org memberships |
| Overview | `/`, `/dashboard` | `/api/reports/overview`, `/api/reports/calls`, `/api/live-status` | Calls, answered, missed, transfers, AHT, answer rate, SMS, recordings, live agents, charts |
| Reports | `/reports`, `/admin/reports` | `/api/reports/overview`, `/api/reports/calls`, `/api/reports/sms`, `/api/reports/recordings`, `/api/reports/transfers`, `/api/reports/numbers`, `/api/reports/agents` | KPI summaries and normalized report tables |
| Calls | `/calls` | `/api/reports/calls`, `/api/recordings/:id/download` | Call log, status, direction, assigned number, transfer status, recording access |
| Live Status | `/live-status` | `/api/live-status`, `/api/live-status/sync` | Agent/extension status, current calls, polling refresh |
| SMS | `/sms`, `/admin/sms` redirect | `/api/reports/sms`, `/api/reports/numbers`, `/api/sms/send`, `/api/mightycall/sync/sms` | SMS direction, sender/recipient, assigned number, message status |
| Recordings | `/recordings`, `/admin/recordings` | `/api/reports/recordings`, `/api/recordings/:id/download`, `/api/mightycall/sync/recordings` | Recording rows and authorized audio/download access |
| Agents | `/team`, `/admin/agents-management` | `/api/orgs/:orgId/members`, `/api/admin/org_users`, `/api/live-status`, MightyCall extension endpoints | Members, roles, extensions, live status |
| Phone Numbers | `/numbers` | `/api/orgs/:orgId/phone-numbers`, `/api/admin/phone-numbers`, `/api/reports/recordings`, sync endpoints | Number inventory, assignment, volume fields when returned |
| Organizations | `/admin/orgs` | `/api/admin/org-metrics`, `/api/admin/orgs`, `/api/admin/orgs/:id` | Org list, members, numbers, metrics, management |
| Billing | `/billing`, `/admin/billing` | `/api/client/billing/*`, `/api/admin/billing/*`, packages endpoints | Packages, invoices, records, payment status |
| Settings | `/account-settings`, `/settings` | `/api/user/profile`, `/api/user/change-password`, org settings/profile upload endpoints | User/org settings without exposing secrets |

## Remaining Watch Items

- Several older admin utility routes still exist for platform operators, but the main sidebar now shows only the requested product IA.
- Some legacy pages still contain direct Supabase client reads; they are protected by router and RLS assumptions but should continue moving toward server-scoped API endpoints.
- External login smoke tests require valid `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the test process.
