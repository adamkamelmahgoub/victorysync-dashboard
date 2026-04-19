begin;

create table if not exists public.voicemail_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  phone_number_id uuid null references public.phone_numbers(id) on delete set null,
  external_id text not null,
  from_number text null,
  to_number text null,
  audio_url text null,
  transcription text null,
  duration_seconds integer null,
  message_date timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voicemail_logs_org_external_unique unique (org_id, external_id)
);

create index if not exists voicemail_logs_org_message_date_idx
  on public.voicemail_logs (org_id, message_date desc);

create index if not exists voicemail_logs_org_phone_number_id_idx
  on public.voicemail_logs (org_id, phone_number_id);

drop trigger if exists set_voicemail_logs_updated_at on public.voicemail_logs;
create trigger set_voicemail_logs_updated_at
before update on public.voicemail_logs
for each row
execute function public.set_row_updated_at();

commit;
