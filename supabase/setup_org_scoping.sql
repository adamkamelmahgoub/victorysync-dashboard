-- Setup script for organization phone numbers and RLS policies
-- Run this in Supabase SQL editor to ensure proper scoping

-- 1) Create org_phone_numbers table (if it doesn't exist)
create table if not exists public.org_phone_numbers (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  phone_number text not null,
  label text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(org_id, phone_number)
);

-- 2) Create org_users table (if it doesn't exist)
-- This stores explicit user-org assignments with roles
create table if not exists public.org_users (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('agent', 'org_manager', 'org_admin', 'admin')),
  mightycall_extension text,
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- 3) Ensure calls table has org_id and necessary indexes
alter table if exists public.calls add column if not exists org_id uuid references public.organizations(id);
create index if not exists idx_calls_org_id on public.calls(org_id);
create index if not exists idx_calls_started_at on public.calls(started_at);
create index if not exists idx_calls_org_started on public.calls(org_id, started_at);

-- 4) Enable RLS on these tables
alter table public.org_phone_numbers enable row level security;
alter table public.org_users enable row level security;
alter table public.calls enable row level security;

-- 5) Drop existing policies if they exist (to avoid conflicts)
drop policy if exists "org_phone_numbers_admin_all" on public.org_phone_numbers;
drop policy if exists "org_phone_numbers_user_read" on public.org_phone_numbers;
drop policy if exists "org_users_admin_all" on public.org_users;
drop policy if exists "org_users_user_read" on public.org_users;
drop policy if exists "calls_admin_all" on public.calls;
drop policy if exists "calls_user_read_own_org" on public.calls;

-- 6) RLS Policies for org_phone_numbers
-- Admin can read/write all
create policy "org_phone_numbers_admin_all"
on public.org_phone_numbers
for all
using ((select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin')
with check ((select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin');

-- Users can read phone numbers for their org
create policy "org_phone_numbers_user_read"
on public.org_phone_numbers
for select
using (
  org_id = (select user_metadata ->> 'org_id' from auth.users where id = auth.uid())::uuid
);

-- 7) RLS Policies for org_users
-- Admin can read/write all
create policy "org_users_admin_all"
on public.org_users
for all
using ((select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin')
with check ((select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin');

-- Users can read assignments for their org
create policy "org_users_user_read"
on public.org_users
for select
using (
  org_id = (select user_metadata ->> 'org_id' from auth.users where id = auth.uid())::uuid
);

-- 8) RLS Policies for calls
-- Admin can read all calls
create policy "calls_admin_all"
on public.calls
for select
using ((select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin');

-- Users can read calls from their org only
create policy "calls_user_read_own_org"
on public.calls
for select
using (
  org_id = (select user_metadata ->> 'org_id' from auth.users where id = auth.uid())::uuid
);

-- 9) Ensure org_settings table exists
create table if not exists public.org_settings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  sla_answer_target_percent integer default 90,
  sla_answer_target_seconds integer default 30,
  service_level_target_pct integer default 90,
  service_level_target_seconds integer default 30,
  created_at timestamptz default now()
);

-- 10) Ensure organizations table exists
create table if not exists public.organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

-- 11) mightycall_extensions table (optional) - store extension metadata
create table if not exists public.mightycall_extensions (
  id uuid default gen_random_uuid() primary key,
  extension text not null,
  display_name text,
  external_id text,
  created_at timestamptz default now(),
  unique(extension)
);

-- Done! All tables and RLS policies are in place for proper multi-tenant data scoping.
