begin;

-- Pilot orchestration schema. The existing public.calls table remains the
-- MightyCall reporting ledger; ai_calls owns voice-vendor lifecycle data.
create table if not exists public.ai_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  client_name text not null,
  qualification_config jsonb not null default '{}'::jsonb,
  voice_config jsonb not null default '{}'::jsonb,
  routing_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.leads
  add column if not exists ai_campaign_id uuid references public.ai_campaigns(id) on delete set null,
  add column if not exists ai_resolution text,
  add column if not exists hubspot_contact_id text,
  add column if not exists qualification_score numeric(5,2),
  add column if not exists qualified_at timestamptz;

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.ai_campaigns(id) on delete restrict,
  vendor text not null,
  vendor_call_id text,
  status text not null default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  transcript text,
  outcome text,
  ai_handled boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_calls_duration_nonnegative check (duration_seconds is null or duration_seconds >= 0),
  unique (vendor, vendor_call_id)
);

create table if not exists public.qualification_results (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.ai_calls(id) on delete cascade,
  score numeric(5,2) not null,
  qualified boolean not null,
  reasoning text not null,
  next_action text not null check (next_action in ('ai_resolved', 'escalate_to_human')),
  scoring_version text not null default 'pilot-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qualification_score_range check (score >= 0 and score <= 100)
);

create table if not exists public.lead_routing_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  qualification_result_id uuid references public.qualification_results(id) on delete set null,
  assigned_agent text not null,
  assigned_agent_id text,
  hubspot_synced boolean not null default false,
  hubspot_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_calls_created_at on public.ai_calls(created_at desc);
create index if not exists idx_ai_calls_campaign_created on public.ai_calls(campaign_id, created_at desc);
create index if not exists idx_ai_calls_lead on public.ai_calls(lead_id, created_at desc);
create index if not exists idx_qualification_qualified on public.qualification_results(qualified, created_at desc);
create index if not exists idx_leads_ai_campaign on public.leads(ai_campaign_id);
create index if not exists idx_routing_lead_created on public.lead_routing_events(lead_id, created_at desc);

create or replace function public.touch_ai_engine_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ai_campaigns_touch_updated_at on public.ai_campaigns;
create trigger ai_campaigns_touch_updated_at before update on public.ai_campaigns
for each row execute function public.touch_ai_engine_updated_at();
drop trigger if exists ai_calls_touch_updated_at on public.ai_calls;
create trigger ai_calls_touch_updated_at before update on public.ai_calls
for each row execute function public.touch_ai_engine_updated_at();
drop trigger if exists qualification_results_touch_updated_at on public.qualification_results;
create trigger qualification_results_touch_updated_at before update on public.qualification_results
for each row execute function public.touch_ai_engine_updated_at();

alter table public.ai_campaigns enable row level security;
alter table public.ai_calls enable row level security;
alter table public.qualification_results enable row level security;
alter table public.lead_routing_events enable row level security;

-- Pilot records are intentionally backend-only. The service-role API is the
-- sole data path until per-org access is introduced.
revoke all on public.ai_campaigns, public.ai_calls, public.qualification_results, public.lead_routing_events from anon, authenticated;

commit;
