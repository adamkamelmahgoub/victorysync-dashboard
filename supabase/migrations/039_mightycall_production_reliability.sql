begin;

create table if not exists public.mightycall_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null,
  org_id uuid null references public.organizations(id) on delete set null,
  event_type text not null default 'unknown',
  external_call_id text null,
  extension text null,
  occurred_at timestamptz null,
  payload_encrypted text not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed','dead_letter')),
  attempts integer not null default 0,
  error_code text null,
  next_attempt_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_event_id)
);
create index if not exists mightycall_webhook_inbox_status_retry_idx on public.mightycall_webhook_inbox(status, next_attempt_at);
create index if not exists mightycall_webhook_inbox_org_created_idx on public.mightycall_webhook_inbox(org_id, created_at desc);
alter table public.mightycall_webhook_inbox enable row level security;

create table if not exists public.integration_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  credentials_ok boolean not null default false,
  webhook_ok boolean not null default false,
  calls_sync_ok boolean not null default false,
  recordings_sync_ok boolean not null default false,
  last_webhook_at timestamptz null,
  last_call_sync_at timestamptz null,
  last_recording_sync_at timestamptz null,
  last_error_code text null,
  metrics jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  unique(org_id, provider)
);
alter table public.integration_health_snapshots enable row level security;

create table if not exists public.integration_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid null references public.organizations(id) on delete cascade,
  provider text not null,
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  resolved_at timestamptz null
);
create index if not exists integration_alerts_open_idx on public.integration_alerts(provider, status, last_seen_at desc);
alter table public.integration_alerts enable row level security;

create table if not exists public.recording_consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_call_id text null,
  phone_number text null,
  consent_status text not null default 'unknown' check (consent_status in ('unknown','granted','denied','not_required')),
  consent_method text null,
  consented_at timestamptz null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recording_consents_call_idx on public.recording_consents(org_id, external_call_id);
alter table public.recording_consents enable row level security;

create table if not exists public.recording_archives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  recording_id uuid null,
  external_call_id text null,
  storage_bucket text not null default 'mightycall-recordings',
  storage_path text not null,
  content_type text null,
  byte_size bigint null,
  checksum_sha256 text null,
  consent_status text not null default 'unknown',
  retention_until timestamptz null,
  legal_hold boolean not null default false,
  archived_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(org_id, storage_path)
);
create index if not exists recording_archives_call_idx on public.recording_archives(org_id, external_call_id);
alter table public.recording_archives enable row level security;

create table if not exists public.recording_access_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  recording_id text not null,
  actor_id uuid null,
  action text not null check (action in ('play','download','archive','transcribe','export')),
  request_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists recording_access_logs_org_created_idx on public.recording_access_logs(org_id, created_at desc);
alter table public.recording_access_logs enable row level security;

create table if not exists public.call_intelligence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  external_call_id text not null,
  recording_id text null,
  transcript text null,
  transcript_status text not null default 'pending' check (transcript_status in ('pending','processing','completed','failed','not_requested')),
  notes text null,
  disposition text null,
  quality_score numeric(5,2) null check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  quality_breakdown jsonb not null default '{}'::jsonb,
  searchable_text tsvector generated always as (to_tsvector('english', coalesce(transcript,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(disposition,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, external_call_id)
);
create index if not exists call_intelligence_search_idx on public.call_intelligence using gin(searchable_text);
alter table public.call_intelligence enable row level security;

commit;
