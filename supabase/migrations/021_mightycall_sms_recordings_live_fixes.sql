begin;

alter table if exists public.mightycall_recordings
  drop constraint if exists mightycall_recordings_call_id_fkey;

alter table if exists public.mightycall_recordings
  alter column call_id drop not null;

create table if not exists public.mightycall_sms_messages (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  phone_id uuid references public.phone_numbers(id) on delete set null,
  external_id text,
  from_number text,
  to_number text,
  message_text text,
  direction text,
  status text,
  sent_at timestamptz,
  message_date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb,
  unique(org_id, external_id)
);

create index if not exists idx_sms_org_id on public.mightycall_sms_messages(org_id);
create index if not exists idx_sms_sent_at on public.mightycall_sms_messages(sent_at desc);
create index if not exists idx_sms_external_id on public.mightycall_sms_messages(external_id);

create index if not exists idx_recordings_org_id on public.mightycall_recordings(org_id);
create index if not exists idx_recordings_recording_date on public.mightycall_recordings(recording_date desc);

commit;
