-- 010_add_billing_packages_and_reporting.sql
-- Add comprehensive billing management, package management, and MightyCall reporting tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a security definer function for checking platform admin status
-- This can be safely used in RLS policies
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'global_role', '') = 'platform_admin';
$$;

-- Create packages table (platform-wide packages that can be assigned to users/orgs)
create table if not exists public.packages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  type text not null check (type in ('user', 'org', 'platform')),
  features jsonb default '{}'::jsonb, -- e.g., {"calls_per_month": 1000, "storage_gb": 10}
  pricing jsonb default '{}'::jsonb, -- e.g., {"monthly": 29.99, "yearly": 299.99}
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create user_packages table (assign packages to users)
create table if not exists public.user_packages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz default now(),
  expires_at timestamptz,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  unique(user_id, package_id)
);

-- Create billing_records table (detailed billing history)
create table if not exists public.billing_records (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('subscription', 'one_time', 'usage', 'refund')),
  description text not null,
  amount decimal(10,2) not null,
  currency text default 'USD',
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  status text default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  billing_date timestamptz default now(),
  due_date timestamptz,
  paid_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Create invoices table (generated invoices)
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  invoice_number text unique not null,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  subtotal decimal(10,2) not null,
  tax_amount decimal(10,2) default 0,
  total_amount decimal(10,2) not null,
  currency text default 'USD',
  status text default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  stripe_invoice_id text,
  pdf_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create invoice_items table (line items for invoices)
create table if not exists public.invoice_items (
  id uuid default gen_random_uuid() primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity int default 1,
  unit_price decimal(10,2) not null,
  total_price decimal(10,2) not null,
  metadata jsonb default '{}'::jsonb
);

-- Create mightycall_reports table (cached reporting data)
create table if not exists public.mightycall_reports (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  phone_number_id uuid references public.phone_numbers(id) on delete cascade,
  report_type text not null check (report_type in ('calls', 'recordings', 'analytics')),
  report_date date not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, phone_number_id, report_type, report_date)
);

-- Create mightycall_recordings table (recording metadata)
create table if not exists public.mightycall_recordings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  phone_number_id uuid references public.phone_numbers(id) on delete cascade,
  call_id text not null,
  recording_url text,
  duration_seconds int,
  recording_date timestamptz not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique(org_id, call_id)
);

-- Indexes for performance
create index if not exists idx_packages_type_active on public.packages(type, is_active);
create index if not exists idx_user_packages_user_id on public.user_packages(user_id);
create index if not exists idx_user_packages_package_id on public.user_packages(package_id);
create index if not exists idx_billing_records_org_id on public.billing_records(org_id);
create index if not exists idx_billing_records_user_id on public.billing_records(user_id);
create index if not exists idx_billing_records_status on public.billing_records(status);
create index if not exists idx_invoices_org_id on public.invoices(org_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);
create index if not exists idx_mightycall_reports_org_phone on public.mightycall_reports(org_id, phone_number_id);
create index if not exists idx_mightycall_reports_date on public.mightycall_reports(report_date);
create index if not exists idx_mightycall_recordings_org_phone on public.mightycall_recordings(org_id, phone_number_id);
create index if not exists idx_mightycall_recordings_date on public.mightycall_recordings(recording_date);

-- Enable RLS
alter table public.packages enable row level security;
alter table public.user_packages enable row level security;
alter table public.billing_records enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.mightycall_reports enable row level security;
alter table public.mightycall_recordings enable row level security;

-- RLS Policies

-- packages: platform admins can manage, all authenticated users can read active packages
drop policy if exists "packages_read" on public.packages;
drop policy if exists "packages_admin_all" on public.packages;

create policy "packages_read"
on public.packages
for select
using (is_active = true);

create policy "packages_admin_all"
on public.packages
for all
using (public.is_platform_admin());

-- user_packages: users can read their own, admins can manage all
drop policy if exists "user_packages_user_read" on public.user_packages;
drop policy if exists "user_packages_admin_all" on public.user_packages;

create policy "user_packages_user_read"
on public.user_packages
for select
using (user_id = auth.uid());

create policy "user_packages_admin_all"
on public.user_packages
for all
using (public.is_platform_admin());

-- billing_records: users can read their own, org admins can read org records, platform admins can read all
drop policy if exists "billing_records_user_read" on public.billing_records;
drop policy if exists "billing_records_org_admin_read" on public.billing_records;
drop policy if exists "billing_records_admin_all" on public.billing_records;

create policy "billing_records_user_read"
on public.billing_records
for select
using (user_id = auth.uid());

create policy "billing_records_org_admin_read"
on public.billing_records
for select
using (
  org_id is not null and
  exists (
    select 1 from public.org_members
    where org_members.org_id = billing_records.org_id
    and org_members.user_id = auth.uid()
    and org_members.role = 'org_admin'
  )
);

create policy "billing_records_admin_all"
on public.billing_records
for all
using (public.is_platform_admin());

-- invoices: org members can read org invoices, admins can manage
drop policy if exists "invoices_org_read" on public.invoices;
drop policy if exists "invoices_admin_all" on public.invoices;

create policy "invoices_org_read"
on public.invoices
for select
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = invoices.org_id
    and org_members.user_id = auth.uid()
  )
);

create policy "invoices_admin_all"
on public.invoices
for all
using (public.is_platform_admin());

-- invoice_items: same as invoices
drop policy if exists "invoice_items_org_read" on public.invoice_items;
drop policy if exists "invoice_items_admin_all" on public.invoice_items;

create policy "invoice_items_org_read"
on public.invoice_items
for select
using (
  exists (
    select 1 from public.invoices i
    join public.org_members ou on ou.org_id = i.org_id
    where i.id = invoice_items.invoice_id
    and ou.user_id = auth.uid()
  )
);

create policy "invoice_items_admin_all"
on public.invoice_items
for all
using (public.is_platform_admin());

-- mightycall_reports: org members can read org reports
drop policy if exists "mightycall_reports_org_read" on public.mightycall_reports;

create policy "mightycall_reports_org_read"
on public.mightycall_reports
for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = mightycall_reports.org_id
    and org_members.user_id = auth.uid()
  )
);

-- mightycall_recordings: org members can read org recordings
drop policy if exists "mightycall_recordings_org_read" on public.mightycall_recordings;

create policy "mightycall_recordings_org_read"
on public.mightycall_recordings
for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = mightycall_recordings.org_id
    and org_members.user_id = auth.uid()
  )
);

-- Insert some default packages
insert into public.packages (name, description, type, features, pricing) values
('Basic User', 'Basic user package with standard features', 'user',
 '{"calls_per_month": 500, "storage_gb": 1}',
 '{"monthly": 9.99, "yearly": 99.99}'),
('Premium User', 'Premium user package with advanced features', 'user',
 '{"calls_per_month": 2000, "storage_gb": 5, "analytics": true}',
 '{"monthly": 29.99, "yearly": 299.99}'),
('Enterprise User', 'Enterprise user package with all features', 'user',
 '{"calls_per_month": 10000, "storage_gb": 50, "analytics": true, "api_access": true}',
 '{"monthly": 99.99, "yearly": 999.99}'),
('Basic Org', 'Basic organization package', 'org',
 '{"users": 5, "calls_per_month": 2500, "storage_gb": 25}',
 '{"monthly": 49.99, "yearly": 499.99}'),
('Premium Org', 'Premium organization package', 'org',
 '{"users": 20, "calls_per_month": 10000, "storage_gb": 100, "advanced_analytics": true}',
 '{"monthly": 199.99, "yearly": 1999.99}'),
('Enterprise Org', 'Enterprise organization package', 'org',
 '{"users": 100, "calls_per_month": 50000, "storage_gb": 500, "advanced_analytics": true, "api_access": true, "white_label": true}',
 '{"monthly": 999.99, "yearly": 9999.99}')
on conflict do nothing;
