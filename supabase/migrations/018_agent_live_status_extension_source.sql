alter table if exists public.agent_live_status
  add column if not exists mightycall_user_id text null,
  add column if not exists raw_status text null,
  add column if not exists normalized_status text null,
  add column if not exists current_call_id text null,
  add column if not exists current_call_direction text null,
  add column if not exists current_counterpart_number text null,
  add column if not exists status_started_at timestamptz null,
  add column if not exists last_synced_at timestamptz null,
  add column if not exists raw_payload jsonb null,
  add column if not exists source text null,
  add column if not exists sync_error text null;

create index if not exists idx_agent_live_status_org_norm_status
  on public.agent_live_status (org_id, normalized_status);

create index if not exists idx_agent_live_status_last_synced_at
  on public.agent_live_status (last_synced_at desc);

