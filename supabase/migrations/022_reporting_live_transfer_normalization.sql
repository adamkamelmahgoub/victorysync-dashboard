begin;

alter table if exists public.agent_live_status
  drop constraint if exists agent_live_status_normalized_status_check;

alter table if exists public.agent_live_status
  add constraint agent_live_status_normalized_status_check
    check (
      normalized_status in (
        'available',
        'ringing',
        'dialing',
        'on_call',
        'on_hold',
        'transferring',
        'wrap_up',
        'dnd',
        'offline',
        'unknown'
      )
    );

create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  external_event_id text not null,
  external_call_id text,
  event_type text not null,
  event_at timestamptz not null default now(),
  agent_extension text,
  direction text,
  from_number text,
  to_number text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique(org_id, external_event_id)
);

create table if not exists public.call_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  external_transfer_id text not null,
  external_call_id text,
  transfer_type text not null default 'unknown',
  transfer_target text,
  result text not null default 'unknown',
  agent_extension text,
  original_caller text,
  original_receiving_number text,
  direction text,
  transferred_at timestamptz not null default now(),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, external_transfer_id)
);

create index if not exists call_events_org_call_idx on public.call_events(org_id, external_call_id);
create index if not exists call_events_org_event_at_idx on public.call_events(org_id, event_at desc);
create index if not exists call_transfers_org_transferred_at_idx on public.call_transfers(org_id, transferred_at desc);
create index if not exists call_transfers_org_agent_idx on public.call_transfers(org_id, agent_extension);
create index if not exists call_transfers_org_call_idx on public.call_transfers(org_id, external_call_id);

alter table public.call_events enable row level security;
alter table public.call_transfers enable row level security;

drop policy if exists "call_events_platform_admin_all" on public.call_events;
create policy "call_events_platform_admin_all"
on public.call_events
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'platform_admin'
  )
);

drop policy if exists "call_events_org_members_read" on public.call_events;
create policy "call_events_org_members_read"
on public.call_events
for select
using (
  exists (
    select 1 from public.org_users ou
    where ou.org_id = call_events.org_id
      and ou.user_id = auth.uid()
  )
);

drop policy if exists "call_transfers_platform_admin_all" on public.call_transfers;
create policy "call_transfers_platform_admin_all"
on public.call_transfers
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'platform_admin'
  )
);

drop policy if exists "call_transfers_org_members_read" on public.call_transfers;
create policy "call_transfers_org_members_read"
on public.call_transfers
for select
using (
  exists (
    select 1 from public.org_users ou
    where ou.org_id = call_transfers.org_id
      and ou.user_id = auth.uid()
  )
);

commit;
