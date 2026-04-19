begin;

alter table if exists public.mightycall_recordings
  add column if not exists phone_number_id uuid references public.phone_numbers(id) on delete set null,
  add column if not exists call_id text,
  add column if not exists recording_date timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists from_number text,
  add column if not exists to_number text;

update public.mightycall_recordings
set
  recording_date = coalesce(recording_date, recorded_at),
  metadata = coalesce(metadata, '{}'::jsonb),
  from_number = coalesce(from_number, metadata->>'from_number'),
  to_number = coalesce(to_number, metadata->>'to_number')
where
  recording_date is null
  or metadata is null
  or from_number is null
  or to_number is null;

create unique index if not exists mightycall_recordings_org_external_unique
  on public.mightycall_recordings (org_id, external_id)
  where external_id is not null;

create index if not exists mightycall_recordings_org_recording_date_idx
  on public.mightycall_recordings (org_id, recording_date desc);

create index if not exists mightycall_recordings_org_phone_number_id_idx
  on public.mightycall_recordings (org_id, phone_number_id);

create index if not exists mightycall_recordings_org_from_to_idx
  on public.mightycall_recordings (org_id, from_number, to_number);

commit;
