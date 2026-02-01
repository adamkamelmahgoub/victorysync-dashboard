# VictorySync Dashboard

This repository contains a full-stack application with a Supabase backend and a Vite + React + TypeScript frontend that provides an all-in-one client hub for VictorySync services.

## Features

- **Dashboard**: Live call performance metrics
- **Numbers**: Manage phone numbers and submit change requests
- **Team**: Invite and manage team members
- **Billing**: Stripe-powered subscription management
- **Support**: Calendly integration and support ticket system
- **Settings**: Organization configuration

## Project Layout

- `client/` - Vite + React + TypeScript + Tailwind frontend
- `server/` - Node + TypeScript Express API (legacy)
- `supabase/` - Database migrations and edge functions

## Setup Instructions

### 1. Database Setup

1. Run the migrations in order:
   - `001_add_to_number_digits.sql` through `007_extend_org_schema_and_add_modules.sql`

2. Enable RLS on all tables and set up policies as defined in `007_extend_org_schema_and_add_modules.sql`

### 2. Supabase Edge Functions

Deploy the edge functions in `supabase/functions/`:

- `create_checkout_session`
- `create_billing_portal_session`
- `stripe_webhook`

Set the following environment variables in Supabase:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_GROWTH`
- `STRIPE_PRICE_SCALE`
- `SITE_URL`

### 3. Client Setup

```bash
cd client
npm install
npm run dev
```

### 4. Server Setup (if needed)

```bash
cd server
npm install
# Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
npm run dev
```

## Environment Variables

### Client (.env)

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Server (.env)

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

## Security

- All data access is scoped by `org_id` with RLS policies
- Only org admins can manage members, billing, and settings
- Audit logs track all critical actions
- Provider tokens are never exposed to the client

## Development

- TypeScript strict mode enabled
- ESLint and Prettier configured
- Tailwind CSS for styling
- Supabase for backend services
