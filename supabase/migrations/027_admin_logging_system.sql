begin;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  session_id text,
  event_type text not null,
  event_name text not null,
  page text,
  element text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.page_view_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  session_id text,
  page text not null,
  page_title text,
  referrer text,
  time_on_page_seconds integer,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  session_id text,
  error_type text not null,
  error_message text not null,
  error_stack text,
  endpoint text,
  http_status integer,
  request_payload jsonb,
  ip_address text,
  user_agent text,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.api_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  session_id text,
  method text not null,
  endpoint text not null,
  status_code integer,
  response_time_ms integer,
  request_size_bytes integer,
  response_size_bytes integer,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.auth_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  event_type text not null,
  email text,
  ip_address text,
  user_agent text,
  failure_reason text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_activity_logs_org_id on public.activity_logs(organization_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_event_type on public.activity_logs(event_type);
create index if not exists idx_error_logs_created_at on public.error_logs(created_at desc);
create index if not exists idx_error_logs_resolved on public.error_logs(resolved);
create index if not exists idx_api_logs_endpoint on public.api_logs(endpoint);
create index if not exists idx_api_logs_created_at on public.api_logs(created_at desc);
create index if not exists idx_auth_logs_created_at on public.auth_logs(created_at desc);
create index if not exists idx_page_view_logs_user_id on public.page_view_logs(user_id);
create index if not exists idx_page_view_logs_created_at on public.page_view_logs(created_at desc);
create index if not exists idx_auth_logs_event_type_created_at on public.auth_logs(event_type, created_at desc);
create index if not exists idx_api_logs_user_created_at on public.api_logs(user_id, created_at desc);

alter table public.activity_logs enable row level security;
alter table public.page_view_logs enable row level security;
alter table public.error_logs enable row level security;
alter table public.api_logs enable row level security;
alter table public.auth_logs enable row level security;

create or replace function public.current_user_admin_log_role(target_org_id uuid)
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
      and p.global_role::text in ('admin', 'super_admin', 'platform_admin')
  )
  or (
    target_org_id is not null
    and exists (
      select 1
      from public.org_users ou
      where ou.user_id = auth.uid()
        and ou.org_id = target_org_id
        and ou.role::text in ('admin', 'super_admin', 'org_admin')
    )
  );
$$;

grant execute on function public.current_user_admin_log_role(uuid) to authenticated;

drop policy if exists activity_logs_admin_select on public.activity_logs;
create policy activity_logs_admin_select
on public.activity_logs
for select
using (
  public.current_user_admin_log_role(organization_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('super_admin', 'platform_admin')
  )
);

drop policy if exists page_view_logs_admin_select on public.page_view_logs;
create policy page_view_logs_admin_select
on public.page_view_logs
for select
using (
  public.current_user_admin_log_role(organization_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('super_admin', 'platform_admin')
  )
);

drop policy if exists error_logs_admin_select on public.error_logs;
create policy error_logs_admin_select
on public.error_logs
for select
using (
  public.current_user_admin_log_role(organization_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('super_admin', 'platform_admin')
  )
);

drop policy if exists api_logs_admin_select on public.api_logs;
create policy api_logs_admin_select
on public.api_logs
for select
using (
  public.current_user_admin_log_role(organization_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('super_admin', 'platform_admin')
  )
);

drop policy if exists auth_logs_admin_select on public.auth_logs;
create policy auth_logs_admin_select
on public.auth_logs
for select
using (
  public.current_user_admin_log_role(organization_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('super_admin', 'platform_admin')
  )
);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'victorysync_log_retention_daily',
      '0 4 * * *',
      $job$
        delete from public.activity_logs where created_at < now() - interval '90 days';
        delete from public.page_view_logs where created_at < now() - interval '90 days';
        delete from public.api_logs where created_at < now() - interval '90 days';
        delete from public.error_logs where created_at < now() - interval '180 days';
        delete from public.auth_logs where created_at < now() - interval '180 days';
      $job$
    );
  end if;
end
$$;

commit;
