create extension if not exists pgcrypto;

create table if not exists public.agent_live_status (
  id uuid primary key default gen_random_uuid(),

  org_id uuid references public.organizations(id) on delete cascade,
  org_member_id uuid null,
  user_id uuid references auth.users(id) on delete set null,

  mightycall_extension text not null,
  extension text null,
  mightycall_user_id text null,

  raw_status text null,
  normalized_status text not null default 'unknown',

  current_call_id text null,
  current_call_direction text null,
  current_counterpart_number text null,

  status_started_at timestamptz null,
  last_synced_at timestamptz not null default now(),

  raw_payload jsonb null,

  external_call_id text null,
  direction text null,
  from_number text null,
  to_number text null,
  status text not null default 'available',
  started_at timestamptz null,
  answered_at timestamptz null,
  ended_at timestamptz null,
  last_event_at timestamptz not null default now(),
  raw_event jsonb null,
  stale boolean not null default false,
  source text null,
  sync_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_live_status_normalized_status_check
    check (
      normalized_status in (
        'available',
        'ringing',
        'dialing',
        'on_call',
        'wrap_up',
        'dnd',
        'offline',
        'unknown'
      )
    )
);

alter table if exists public.agent_live_status
  add column if not exists org_member_id uuid null,
  add column if not exists mightycall_extension text,
  add column if not exists extension text,
  add column if not exists mightycall_user_id text,
  add column if not exists raw_status text,
  add column if not exists normalized_status text not null default 'unknown',
  add column if not exists current_call_id text,
  add column if not exists current_call_direction text,
  add column if not exists current_counterpart_number text,
  add column if not exists status_started_at timestamptz,
  add column if not exists last_synced_at timestamptz not null default now(),
  add column if not exists raw_payload jsonb,
  add column if not exists source text,
  add column if not exists sync_error text,
  add column if not exists id uuid default gen_random_uuid();

update public.agent_live_status
set mightycall_extension = coalesce(nullif(mightycall_extension, ''), nullif(extension, ''))
where coalesce(mightycall_extension, '') = '';

update public.agent_live_status
set extension = coalesce(nullif(extension, ''), nullif(mightycall_extension, ''))
where coalesce(extension, '') = '';

alter table if exists public.agent_live_status
  alter column mightycall_extension set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'org_members'
  ) then
    begin
      alter table public.agent_live_status
        add constraint agent_live_status_org_member_fk
          foreign key (org_member_id) references public.org_members(id) on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

create unique index if not exists agent_live_status_extension_unique
on public.agent_live_status (mightycall_extension);

create unique index if not exists agent_live_status_org_extension_unique
on public.agent_live_status (org_id, mightycall_extension);

create unique index if not exists agent_live_status_org_legacy_extension_unique
on public.agent_live_status (org_id, extension);

create index if not exists agent_live_status_org_id_idx
on public.agent_live_status (org_id);

create index if not exists agent_live_status_org_member_id_idx
on public.agent_live_status (org_member_id);

create index if not exists agent_live_status_last_synced_at_idx
on public.agent_live_status (last_synced_at);

create index if not exists agent_live_status_status_idx
on public.agent_live_status (normalized_status);

create or replace function public.sync_agent_live_status_extension_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.mightycall_extension, '') = '' then
    new.mightycall_extension := new.extension;
  end if;
  if coalesce(new.extension, '') = '' then
    new.extension := new.mightycall_extension;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_agent_live_status_extension_columns on public.agent_live_status;
create trigger sync_agent_live_status_extension_columns
before insert or update on public.agent_live_status
for each row
execute function public.sync_agent_live_status_extension_columns();

create or replace function public.set_agent_live_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_agent_live_status_updated_at
on public.agent_live_status;

create trigger set_agent_live_status_updated_at
before update on public.agent_live_status
for each row
execute function public.set_agent_live_status_updated_at();

alter table public.agent_live_status enable row level security;

drop policy if exists "agent_live_status_platform_admin_all" on public.agent_live_status;
create policy "agent_live_status_platform_admin_all"
on public.agent_live_status
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'platform_admin'
  )
);

drop policy if exists "agent_live_status_org_members_read" on public.agent_live_status;
create policy "agent_live_status_org_members_read"
on public.agent_live_status
for select
using (
  exists (
    select 1
    from public.org_users ou
    where ou.org_id = agent_live_status.org_id
      and ou.user_id = auth.uid()
  )
);

select pg_notify('pgrst', 'reload schema');

