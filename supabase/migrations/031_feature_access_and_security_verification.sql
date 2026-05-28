begin;

create table if not exists public.org_feature_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  visible_to_roles text[] not null default array['org_admin', 'org_manager', 'agent']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, feature_key)
);

create table if not exists public.user_feature_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, user_id, feature_key)
);

create index if not exists org_feature_access_org_idx
  on public.org_feature_access(org_id, feature_key);

create index if not exists user_feature_access_org_user_idx
  on public.user_feature_access(org_id, user_id, feature_key);

alter table public.org_feature_access enable row level security;
alter table public.user_feature_access enable row level security;

drop policy if exists "org_feature_access_platform_admin_all" on public.org_feature_access;
create policy "org_feature_access_platform_admin_all"
on public.org_feature_access
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('platform_admin', 'admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('platform_admin', 'admin', 'super_admin')
  )
);

drop policy if exists "org_feature_access_org_members_read" on public.org_feature_access;
create policy "org_feature_access_org_members_read"
on public.org_feature_access
for select
using (
  exists (
    select 1 from public.org_users ou
    where ou.org_id = org_feature_access.org_id
      and ou.user_id = auth.uid()
  )
);

drop policy if exists "user_feature_access_platform_admin_all" on public.user_feature_access;
create policy "user_feature_access_platform_admin_all"
on public.user_feature_access
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('platform_admin', 'admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role in ('platform_admin', 'admin', 'super_admin')
  )
);

drop policy if exists "user_feature_access_own_read" on public.user_feature_access;
create policy "user_feature_access_own_read"
on public.user_feature_access
for select
using (user_id = auth.uid());

create or replace function public.security_table_rls_status()
returns table (
  table_schema text,
  table_name text,
  rls_enabled boolean,
  policy_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    t.schemaname::text as table_schema,
    t.tablename::text as table_name,
    t.rowsecurity as rls_enabled,
    count(p.policyname)::bigint as policy_count
  from pg_catalog.pg_tables t
  left join pg_catalog.pg_policies p
    on p.schemaname = t.schemaname
   and p.tablename = t.tablename
  where t.schemaname = 'public'
    and t.tablename not like 'pg_%'
  group by t.schemaname, t.tablename, t.rowsecurity
  order by t.tablename;
$$;

create or replace function public.security_storage_bucket_status()
returns table (
  id text,
  name text,
  public boolean,
  file_size_limit bigint
)
language sql
security definer
set search_path = public, storage
as $$
  select b.id, b.name, b.public, b.file_size_limit
  from storage.buckets b
  order by b.name;
$$;

commit;
