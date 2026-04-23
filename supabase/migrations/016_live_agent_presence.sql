create table if not exists public.live_agent_presence (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  extension text not null,
  email text null,
  display_name text null,
  on_call boolean not null default false,
  status text null,
  counterpart text null,
  started_at timestamptz null,
  source text null,
  raw_status text null,
  last_seen_at timestamptz null,
  refreshed_at timestamptz not null default now(),
  stale_after timestamptz not null,
  sync_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_live_agent_presence_org_id
  on public.live_agent_presence (org_id);

create index if not exists idx_live_agent_presence_extension
  on public.live_agent_presence (extension);

create index if not exists idx_live_agent_presence_stale_after
  on public.live_agent_presence (stale_after);

create index if not exists idx_live_agent_presence_refreshed_at
  on public.live_agent_presence (refreshed_at desc);
