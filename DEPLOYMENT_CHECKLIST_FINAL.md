# VictorySync Dashboard - Deployment Checklist

**Status:** Production-Ready (Ready for Staging Deployment)  
**Date:** February 1, 2026  
**Version:** 1.0.0

## ✅ Completed Components

### Database & Schema
- [x] Full migration file created: `supabase/migrations/000_full_migration.sql`
- [x] All tables created: `organizations`, `org_members`, `org_users`, `profiles`, `org_integrations`, `integration_sync_jobs`, phone data tables, reports, recordings, SMS logs
- [x] RLS policies applied to all tables
- [x] Helper functions created for auth and org resolution

### Authentication & Authorization
- [x] User profile endpoint (`GET /api/user/profile`) with canonical global_role
- [x] Org list endpoint (`GET /api/user/orgs`) for org discovery
- [x] Onboarding endpoint (`POST /api/user/onboard`) for new user setup
- [x] Role validation on org membership endpoints (prevents platform_admin in org_members)
- [x] Service key support in API middleware (`x-service-key` / `x-admin-key` headers)

### Frontend UI
- [x] AuthContext updated to fetch canonical profile and org list
- [x] Org switcher in AdminTopNav
- [x] Dashboard updated to use selectedOrgId
- [x] Admin Integrations page created (AdminMightyCallPage)
- [x] Numbers page updated with sync button
- [x] Reports page created with date range and sync
- [x] Recordings page created with date range and sync
- [x] SMS page created
- [x] Routes wired in main.tsx

### Server API Endpoints
- [x] `GET /api/user/profile` — fetch user's canonical profile
- [x] `GET /api/user/orgs` — fetch list of org memberships
- [x] `POST /api/user/onboard` — onboard new user to org
- [x] `GET /api/mightycall/phone-numbers` — fetch org phone numbers
- [x] `GET /api/mightycall/reports` — fetch org reports
- [x] `GET /api/mightycall/recordings` — fetch org recordings
- [x] `GET /api/sms/messages` — fetch org SMS messages
- [x] `POST /api/mightycall/sync/phone-numbers` — trigger phone number sync (platform scope)
- [x] `POST /api/mightycall/sync/reports` — trigger reports sync (platform or org scope)
- [x] `POST /api/mightycall/sync/recordings` — trigger recordings sync (platform or org scope)
- [x] `GET /api/mightycall/sync/jobs` — list sync job history
- [x] `GET /api/admin/orgs/:orgId/integrations` — get org integration metadata
- [x] `POST /api/admin/orgs/:orgId/integrations` — save org integration credentials
- [x] `DELETE /api/admin/orgs/:orgId/integrations/:provider` — remove org integration

### Integration & Security
- [x] Per-org integration credential store (`integrationsStore.ts`) with AES-256-GCM encryption
- [x] MightyCall sync functions updated to accept per-org credential overrides
- [x] MightyCall sync endpoints wired to load and use per-org credentials
- [x] Edge Function skeleton created (`functions/mightycall-sync/index.js`)
- [x] Client API helpers for integration management (`integrationsApi.ts`)
- [x] Client API helpers for triggering syncs (`apiClient.ts`)

## ⏳ Pending Tasks (Pre-Staging Deployment)

### 1. Environment Setup
- [ ] Set `INTEGRATIONS_KEY` in server env (encryption key for per-org credentials)
- [ ] Set `SERVICE_KEY` / `SERVER_SERVICE_KEY` in server env (for Edge Function auth)
- [ ] Configure Edge Function env vars: `SERVER_ADMIN_URL`, `SERVER_SERVICE_KEY`
- [ ] Verify `SUPABASE_SERVICE_ROLE` is set
- [ ] Verify MightyCall API credentials are configured

### 2. Edge Function Deployment
- [ ] Deploy `functions/mightycall-sync` to Supabase
- [ ] Test Edge Function can authenticate with `x-service-key`
- [ ] Test Edge Function can trigger sync jobs via server endpoints
- [ ] Set up CloudScheduler or cron trigger (optional but recommended)

### 3. Testing
- [ ] Run RLS test script: `node test-rls.js`
- [ ] Verify org-scoped RLS: non-admin users can only see their org data
- [ ] Verify platform admin can see all org data
- [ ] Test org switcher in admin UI works correctly
- [ ] Test MightyCall sync creates jobs and updates tables
- [ ] Test per-org credentials are used in sync (verify via server logs)
- [ ] Test Numbers/Reports/Recordings/SMS pages load and display data

### 4. Migration & Data Setup
- [ ] Back up production Supabase database
- [ ] Run migration `000_full_migration.sql` in staging Supabase
- [ ] Seed test organizations and users
- [ ] Set up platform admin user
- [ ] Create test org integrations with MightyCall credentials

### 5. Deployment
- [ ] Build client: `npm run build` in `client/`
- [ ] Build server: `npm run build` in `server/`
- [ ] Deploy server to staging (e.g., Railway, Heroku, or VPS)
- [ ] Configure server env vars in staging
- [ ] Deploy client to staging CDN or server
- [ ] Update `API_BASE_URL` in client config to point to staging server
- [ ] Deploy Edge Function to Supabase staging
- [ ] Smoke test entire flow: login → select org → trigger sync → view data

### 6. Documentation
- [ ] Update README with deployment instructions
- [ ] Document env var requirements
- [ ] Add runbook for ops team (how to restore from backup, scale, etc.)
- [ ] Create user guide for platform admins (how to manage org integrations)

## Environment Variables Required

### Server
```
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE=<service-role-key>
INTEGRATIONS_KEY=<32-byte-hex-encryption-key>  # or falls back to SERVICE_KEY
SERVICE_KEY=<service-key-for-edge-functions>
MIGHTYCALL_API_KEY=<default-mightycall-key>  # optional, can be org-specific
MIGHTYCALL_USER_KEY=<default-mightycall-user-key>  # optional
API_BASE_URL=<server-url>
PORT=4000
```

### Client
```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_BASE_URL=<server-url>
```

### Edge Function
```
SERVER_ADMIN_URL=<server-base-url>
SERVER_SERVICE_KEY=<service-key>
```

## Verification Checklist (Before Go-Live)

- [ ] All RLS policies are active and tested
- [ ] No sensitive data (secrets, tokens) in client bundle
- [ ] Per-org credentials are encrypted and never logged
- [ ] Sync jobs create audit trail in `integration_sync_jobs` table
- [ ] Phone numbers, reports, recordings properly filtered by org
- [ ] Admin can manage per-org integrations via UI
- [ ] Non-admin users cannot access other orgs' data
- [ ] Error handling is graceful (user-friendly error messages)
- [ ] API rate limiting is in place (optional but recommended)
- [ ] Database backups are configured
- [ ] Monitoring/logging is set up

## Success Criteria

- ✅ Users can authenticate and see their org's data
- ✅ Admins can manage MightyCall credentials per organization
- ✅ Sync jobs run and populate tables correctly
- ✅ All pages (Numbers, Reports, Recordings, SMS) load and display data
- ✅ No data leaks between organizations (RLS working)
- ✅ Edge Function can trigger syncs (async job creation)
- ✅ Error messages are user-friendly and help with troubleshooting

## Rollback Plan

If critical issues are discovered after deployment:

1. Revert server to previous stable version
2. Revert client to previous stable version
3. Restore database from backup (if data corruption occurred)
4. Notify users of service restoration

Keep a backup of the previous working version and database snapshot before each deployment.

---

**Next Step:** Follow the "Pending Tasks" section to deploy to staging, then run the verification checklist.
