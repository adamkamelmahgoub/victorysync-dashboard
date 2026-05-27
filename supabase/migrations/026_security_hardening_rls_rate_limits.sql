begin;

create table if not exists public.rate_limit_violations (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  endpoint text not null,
  user_id uuid,
  timestamp timestamptz not null default now()
);

create table if not exists public.auth_lockouts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  locked_until timestamptz not null,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ip_address)
);

create index if not exists rate_limit_violations_timestamp_idx
  on public.rate_limit_violations(timestamp desc);

create index if not exists rate_limit_violations_user_timestamp_idx
  on public.rate_limit_violations(user_id, timestamp desc);

create index if not exists auth_lockouts_ip_locked_until_idx
  on public.auth_lockouts(ip_address, locked_until desc);

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'platform_admin'
  );
$$;

create or replace function public.current_user_in_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_platform_admin()
    or exists (
      select 1
      from public.org_users ou
      where ou.user_id = auth.uid()
        and ou.org_id = target_org_id
    )
    or exists (
      select 1
      from public.org_members om
      where om.user_id = auth.uid()
        and om.org_id = target_org_id
    );
$$;

grant execute on function public.current_user_is_platform_admin() to authenticated;
grant execute on function public.current_user_in_org(uuid) to authenticated;

do $$
declare
  tbl record;
  col_name text;
  rel regclass;
  policy_prefix text;
begin
  for tbl in
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    rel := format('%I.%I', tbl.table_schema, tbl.table_name)::regclass;
    execute format('alter table %s enable row level security', rel);

    select c.column_name into col_name
    from information_schema.columns c
    where c.table_schema = tbl.table_schema
      and c.table_name = tbl.table_name
      and c.column_name in ('org_id', 'organization_id')
    order by case c.column_name when 'org_id' then 1 else 2 end
    limit 1;

    if col_name is not null then
      policy_prefix := left(tbl.table_name || '_org_isolation', 40);
      execute format('drop policy if exists %I on %s', policy_prefix || '_select', rel);
      execute format(
        'create policy %I on %s for select using (public.current_user_in_org(%I))',
        policy_prefix || '_select',
        rel,
        col_name
      );
      execute format('drop policy if exists %I on %s', policy_prefix || '_insert', rel);
      execute format(
        'create policy %I on %s for insert with check (public.current_user_in_org(%I))',
        policy_prefix || '_insert',
        rel,
        col_name
      );
      execute format('drop policy if exists %I on %s', policy_prefix || '_update', rel);
      execute format(
        'create policy %I on %s for update using (public.current_user_in_org(%I)) with check (public.current_user_in_org(%I))',
        policy_prefix || '_update',
        rel,
        col_name,
        col_name
      );
      execute format('drop policy if exists %I on %s', policy_prefix || '_delete', rel);
      execute format(
        'create policy %I on %s for delete using (public.current_user_in_org(%I))',
        policy_prefix || '_delete',
        rel,
        col_name
      );
    end if;
  end loop;
end
$$;

drop policy if exists profiles_self_or_same_org_or_admin_select on public.profiles;
create policy profiles_self_or_same_org_or_admin_select
on public.profiles
for select
using (
  id = auth.uid()
  or public.current_user_is_platform_admin()
  or exists (
    select 1
    from public.org_users mine
    join public.org_users theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

drop policy if exists profiles_self_or_admin_update on public.profiles;
create policy profiles_self_or_admin_update
on public.profiles
for update
using (id = auth.uid() or public.current_user_is_platform_admin())
with check (id = auth.uid() or public.current_user_is_platform_admin());

drop policy if exists rate_limit_platform_admin_read on public.rate_limit_violations;
create policy rate_limit_platform_admin_read
on public.rate_limit_violations
for select
using (public.current_user_is_platform_admin());

do $$
declare
  tbl record;
  col record;
  idx_name text;
begin
  for tbl in
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    for col in
      select column_name
      from information_schema.columns
      where table_schema = tbl.table_schema
        and table_name = tbl.table_name
        and column_name in ('org_id', 'organization_id', 'user_id', 'created_at', 'status', 'role')
    loop
      idx_name := left(format('%s_%s_idx_%s', tbl.table_name, col.column_name, substr(md5(tbl.table_name || col.column_name), 1, 8)), 63);
      execute format(
        'create index if not exists %I on %I.%I (%I)',
        idx_name,
        tbl.table_schema,
        tbl.table_name,
        col.column_name
      );
    end loop;
  end loop;
end
$$;

update storage.buckets
set public = false
where public = true;

commit;
