# VictorySync Dashboard — Production Deployment Guide

Complete production deployment guide for VictorySync Dashboard covering Supabase database, Node.js backend, React frontend, Edge Functions, MightyCall webhook integration, and comprehensive testing.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Step 1: Supabase Setup](#step-1-supabase-setup)
4. [Step 2: Environment Configuration](#step-2-environment-configuration)
5. [Step 3: Deploy Edge Functions](#step-3-deploy-edge-functions)
6. [Step 4: Deploy Backend Server](#step-4-deploy-backend-server)
7. [Step 5: Deploy Frontend](#step-5-deploy-frontend)
8. [Step 6: MightyCall Webhook Configuration](#step-6-mightycall-webhook-configuration)
9. [Step 7: Testing & Verification](#step-7-testing--verification)
10. [Monitoring & Maintenance](#monitoring--maintenance)
11. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase CLI: `npm install -g supabase`
- Git
- MightyCall account with API credentials
- Domain/hosting for frontend and backend

## Architecture Overview

```
┌─────────────────────────┐
│   React Frontend        │
│  (Vite + TypeScript)    │
│  (Vercel/Netlify/S3)    │
└────────┬────────────────┘
         │ HTTPS
         ▼
┌──────────────────────────────┐
│  Node.js/Express Backend     │
│  (TypeScript, supabase-admin)│
│  (Heroku/Railway/AWS)        │
└────────┬─────────────────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
    ┌──────────┐      ┌──────────────┐
    │ Supabase │      │  MightyCall  │
    │ Postgres │      │ API/Webhooks │
    │   + RLS  │      └──────────────┘
    │ + Edge   │
    │Functions │
    └──────────┘
```

## Step 1: Supabase Setup

### 1.1 Create/Link Supabase Project

```bash
# Login to Supabase CLI
supabase login

# Link to existing project
supabase link --project-ref <project-ref>

# Verify connection
supabase status
```

### 1.2 Apply Database Migration

```bash
# Push migration (creates all tables, RLS policies, helpers)
supabase db push

# Verify tables exist
supabase db execute --query "SELECT * FROM information_schema.tables WHERE table_schema='public';"
```

## Step 2: Environment Configuration

### 2.1 Backend Server (.env)

Create `server/.env`:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Server
PORT=4000
NODE_ENV=production
LOG_LEVEL=info
FRONTEND_URL=https://your-domain.com

# MightyCall (optional per-org configuration)
MIGHTYCALL_API_KEY=
MIGHTYCALL_USER_KEY=
MIGHTYCALL_BASE_URL=https://api.mightycall.com
```

### 2.2 Frontend Client (.env.production)

Create `client/.env.production`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=https://api.your-domain.com
```

### 2.3 Supabase Secrets (for Edge Functions)

```bash
# Set MightyCall webhook secret
npx supabase secrets set MIGHTYCALL_WEBHOOK_SECRET="your-webhook-secret"

# Verify
npx supabase secrets list
```

### Database Migration

Apply the full migration to set up schema, RLS policies, helper functions, and seed data:

```bash
npx supabase db push -p <project-ref>
# or manually execute supabase/migrations/000_full_migration.sql
```

## Deployment Steps

### 1. Build Server

```bash
cd server
npm install
npm run build
```

Output: `dist/index.js`

### 2. Build Client

```bash
cd client
npm install
npm run build
```

Output: `dist/` (static assets for CDN or hosting)

### 3. Deploy Server

Options:
- **Docker:** Build image from Dockerfile and push to container registry
- **Railway/Render:** Connect GitHub repo, set env vars
- **AWS Lambda:** Wrap Express with Serverless Framework
- **Traditional VPS:** Copy `server/dist/` to server, run with PM2 or Systemd

Example systemd service:
```ini
[Unit]
Description=VictorySync Backend
After=network.target

[Service]
Type=simple
User=victorysync
WorkingDirectory=/opt/victorysync-server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
EnvironmentFile=/etc/victorysync/.env

[Install]
WantedBy=multi-user.target
```

### 4. Deploy Client

Upload static build output to:
- **AWS S3 + CloudFront:** `npm run deploy:s3`
- **Vercel/Netlify:** Connect GitHub repo
- **Nginx/Apache:** Serve from `client/dist/` directory

Example nginx config:
```nginx
server {
  listen 443 ssl;
  server_name dashboard.yourdomain.com;

  root /var/www/victorysync/dist;
  index index.html;

  # SPA: route all non-file requests to index.html
  location / {
    try_files $uri /index.html;
  }

  # API proxy to backend
  location /api/ {
    proxy_pass http://localhost:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  ssl_certificate /etc/letsencrypt/live/dashboard.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/dashboard.yourdomain.com/privkey.pem;
}
```

### 5. Deploy Edge Functions (MightyCall Sync)

Deploy the Edge Function from `functions/mightycall-sync/`:

```bash
# Using Supabase CLI
npx supabase functions deploy mightycall-sync --project-ref <project-ref>

# Or manually:
# 1. Copy functions/mightycall-sync/index.js to Supabase Functions editor
# 2. Set env vars: SERVER_ADMIN_URL, SERVER_SERVICE_KEY
# 3. Deploy
```

## Post-Deployment Verification

### 1. Run Health Checks

```bash
curl https://api.yourdomain.com/health
# Expected: { "status": "ok" }
```

### 2. Run RLS Verification

```bash
node scripts/verify-rls.js
```

### 3. Run Smoke Tests

```bash
node scripts/smoke-test.js
```

## Key Features

### Authentication
- Supabase Auth (email/password, SSO via Google/GitHub)
- Platform admin role for global privileges
- Organization admins/managers for per-org control
- User profiles synchronized across auth and database

### Multi-Tenancy
- Organizations (fully isolated via RLS)
- Organization members with role-based permissions
- Organization integrations (secure credential storage)
- Per-org phone number assignments

### MightyCall Integration
- Phone number sync (automatic or manual trigger)
- Call reports, recordings, SMS logs
- Per-org credentials (stored encrypted in `org_integrations`)
- Sync jobs tracking and status monitoring

### Dashboard & UI
- Real-time metrics and KPI tiles
- Call performance charts and queue status
- Organization switcher (for admins)
- Pages: Numbers, Team, Billing, Reports, Settings
- Admin panel: Organizations, Users, API Keys, Integrations

### Security
- Row-Level Security (RLS) on all data tables
- Role-based access control (RBAC)
- API key management (org-level and platform-level)
- Service key validation for Edge Functions
- Secrets never stored in client; all in `org_integrations` (encrypted by Supabase)

## Maintenance

### Database Backups
```bash
# Using Supabase Dashboard or CLI
npx supabase db backup-create --project-ref <project-ref>
```

### Monitor Sync Jobs
```sql
SELECT * FROM integration_sync_jobs ORDER BY created_at DESC LIMIT 10;
```

### Check RLS Policies
```sql
SELECT * FROM pg_policies;
```

### Clear Old Data (optional)
```sql
-- Delete old sync runs (keep last 30 days)
DELETE FROM integration_sync_jobs WHERE created_at < NOW() - INTERVAL '30 days';
```

## Troubleshooting

### "Organization not found"
- Check that user has `org_members` entry
- Run: `POST /api/user/onboard` to auto-create org

### RLS blocking access
- Verify user has correct `org_members.role`
- Check that row belongs to user's org
- Review RLS policies in Supabase Dashboard

### MightyCall sync failing
- Verify `org_integrations` credentials are valid
- Check `integration_sync_jobs` table for error messages
- Test credentials: `POST /api/admin/mightycall/sync`

### API key not working
- Verify key hash matches in `platform_api_keys` or `org_api_keys`
- Check `last_used_at` timestamp (may be expired if too old)
- Regenerate key if needed

## Scaling Recommendations

- **Database:** Supabase auto-scales; monitor connection limits
- **Backend:** Run multiple instances behind load balancer
- **Static assets:** Serve from CDN (CloudFront, Cloudflare)
- **MightyCall sync:** Use job queues (BullMQ, RabbitMQ) for async processing
- **WebSockets:** Add Socket.io for real-time updates (future enhancement)

## Support & Monitoring

- **Error tracking:** Integrate Sentry or similar
- **Uptime monitoring:** Use Pingdom or UptimeRobot
- **Logs:** Use ELK stack or CloudWatch for aggregation
- **Metrics:** Prometheus + Grafana for performance monitoring

---

**Last Updated:** February 1, 2026
