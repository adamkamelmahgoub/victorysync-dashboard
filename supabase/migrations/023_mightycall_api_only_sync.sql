begin;

create table if not exists public.live_agent_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  org_member_id uuid null,
  mightycall_user_id text,
  agent_name text,
  extension text,
  status text not null default 'unknown',
  raw_status text,
  direction text,
  current_call_id text,
  from_number text,
  to_number text,
  business_number text,
  started_at timestamptz,
  connected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'org_members'
  ) then
    begin
      alter table public.live_agent_statuses
        add constraint live_agent_statuses_org_member_fk
        foreign key (org_member_id) references public.org_members(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

create unique index if not exists live_agent_statuses_org_extension_idx
on public.live_agent_statuses(org_id, extension)
where extension is not null;

alter table if exists public.calls
  add column if not exists external_call_id text,
  add column if not exists org_member_id uuid null,
  add column if not exists mightycall_user_id text,
  add column if not exists extension text,
  add column if not exists business_number text,
  add column if not exists connected_at timestamptz,
  add column if not exists wait_seconds integer default 0,
  add column if not exists has_recording boolean default false,
  add column if not exists recording_url text,
  add column if not exists raw_payload jsonb;

create unique index if not exists calls_org_external_call_id_idx
on public.calls(org_id, external_call_id)
where external_call_id is not null;

alter table if exists public.mightycall_recordings
  add column if not exists external_call_id text,
  add column if not exists external_recording_id text,
  add column if not exists org_member_id uuid null,
  add column if not exists mightycall_user_id text,
  add column if not exists extension text,
  add column if not exists direction text,
  add column if not exists business_number text,
  add column if not exists raw_payload jsonb;

alter table if exists public.mightycall_sms_messages
  add column if not exists external_message_id text,
  add column if not exists business_number text,
  add column if not exists body text,
  add column if not exists raw_payload jsonb;

alter table if exists public.call_transfers
  add column if not exists extension text,
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists business_number text,
  add column if not exists transfer_status text not null default 'unknown';

alter table public.live_agent_statuses enable row level security;

drop policy if exists "live_agent_statuses_platform_admin_all" on public.live_agent_statuses;
create policy "live_agent_statuses_platform_admin_all"
on public.live_agent_statuses
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'platform_admin'
  )
);

drop policy if exists "live_agent_statuses_org_members_read" on public.live_agent_statuses;
create policy "live_agent_statuses_org_members_read"
on public.live_agent_statuses
for select
using (
  exists (
    select 1 from public.org_users ou
    where ou.org_id = live_agent_statuses.org_id
      and ou.user_id = auth.uid()
  )
);

commit;
