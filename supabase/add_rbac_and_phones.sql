-- RBAC and Phone Number Management Schema
-- Run this in Supabase SQL editor after setup_org_scoping.sql

-- 1) Rename org_phone_numbers to phone_numbers with better schema
drop table if exists public.phone_numbers cascade;
create table public.phone_numbers (
  id uuid default gen_random_uuid() primary key,
  number text not null,
  external_id text unique not null,
  org_id uuid references public.organizations(id) on delete set null,
  label text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(number)
);
create index idx_phone_numbers_org_id on public.phone_numbers(org_id);
create index idx_phone_numbers_external_id on public.phone_numbers(external_id);

-- 2) Rename org_users to org_members for clarity
drop table if exists public.org_members cascade;
create table public.org_members (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('agent', 'org_manager', 'org_admin')),
  mightycall_extension text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, user_id)
);
create index idx_org_members_org_id on public.org_members(org_id);
create index idx_org_members_user_id on public.org_members(user_id);

-- 3) Org Manager Permissions
drop table if exists public.org_manager_permissions cascade;
create table public.org_manager_permissions (
  id uuid default gen_random_uuid() primary key,
  org_member_id uuid not null references public.org_members(id) on delete cascade,
  can_manage_agents boolean default false,
  can_manage_phone_numbers boolean default false,
  can_edit_service_targets boolean default false,
  can_view_billing boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint check_is_manager check (
    (select role from public.org_members where id = org_member_id) = 'org_manager'
  )
);
create index idx_org_manager_permissions_member_id on public.org_manager_permissions(org_member_id);

-- 4) Add global_role to profiles/users
alter table if exists public.profiles add column if not exists global_role text check (global_role in ('platform_admin', 'platform_manager', null));
create index if not exists idx_profiles_global_role on public.profiles(global_role);

-- 5) Platform Manager Permissions
drop table if exists public.platform_manager_permissions cascade;
create table public.platform_manager_permissions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  can_manage_phone_numbers_global boolean default false,
  can_manage_agents_global boolean default false,
  can_manage_orgs boolean default false,
  can_view_billing_global boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint check_is_platform_manager check (
    (select global_role from public.profiles where id = user_id) = 'platform_manager'
  )
);
create index idx_platform_manager_permissions_user_id on public.platform_manager_permissions(user_id);

-- 6) Enable RLS on new tables
alter table public.phone_numbers enable row level security;
alter table public.org_members enable row level security;
alter table public.org_manager_permissions enable row level security;
alter table public.platform_manager_permissions enable row level security;

-- 7) RLS Policies for phone_numbers
drop policy if exists "phone_numbers_admin_all" on public.phone_numbers;
drop policy if exists "phone_numbers_org_read" on public.phone_numbers;

create policy "phone_numbers_admin_all"
on public.phone_numbers
for all
using (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
)
with check (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
);

create policy "phone_numbers_org_read"
on public.phone_numbers
for select
using (
  org_id is null or
  org_id in (
    select org_id from public.org_members where user_id = auth.uid()
  )
);

-- 8) RLS Policies for org_members
drop policy if exists "org_members_admin_all" on public.org_members;
drop policy if exists "org_members_org_read" on public.org_members;

create policy "org_members_admin_all"
on public.org_members
for all
using (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
)
with check (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
);

create policy "org_members_org_read"
on public.org_members
for select
using (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
);

-- 9) RLS Policies for org_manager_permissions
drop policy if exists "org_manager_perms_admin" on public.org_manager_permissions;
drop policy if exists "org_manager_perms_read" on public.org_manager_permissions;

create policy "org_manager_perms_admin"
on public.org_manager_permissions
for all
using (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
)
with check (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
);

create policy "org_manager_perms_read"
on public.org_manager_permissions
for select
using (
  org_member_id in (
    select id from public.org_members
    where user_id = auth.uid() and org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  )
);

-- 10) RLS Policies for platform_manager_permissions
drop policy if exists "platform_manager_perms_admin" on public.platform_manager_permissions;
drop policy if exists "platform_manager_perms_self" on public.platform_manager_permissions;

create policy "platform_manager_perms_admin"
on public.platform_manager_permissions
for all
using (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
)
with check (
  (select global_role from public.profiles where id = auth.uid()) = 'platform_admin'
);

create policy "platform_manager_perms_self"
on public.platform_manager_permissions
for select
using (user_id = auth.uid());

-- Done!
