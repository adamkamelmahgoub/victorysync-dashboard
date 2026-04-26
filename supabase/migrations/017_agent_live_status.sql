create table if not exists public.agent_live_status (
  org_id uuid not null references public.organizations(id) on delete cascade,
  extension text not null,
  user_id uuid null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, extension)
);

create index if not exists idx_agent_live_status_org_id
  on public.agent_live_status (org_id);

create index if not exists idx_agent_live_status_status
  on public.agent_live_status (status);

create index if not exists idx_agent_live_status_last_event_at
  on public.agent_live_status (last_event_at desc);
