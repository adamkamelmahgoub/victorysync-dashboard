begin;

alter table if exists public.mightycall_reports
  add column if not exists phone_number_id uuid,
  add column if not exists report_type text not null default 'analytics',
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mightycall_reports'
      and column_name = 'metrics'
  ) then
    execute $sql$
      update public.mightycall_reports
      set data = coalesce(data, metrics, '{}'::jsonb)
      where data = '{}'::jsonb
        and metrics is not null
    $sql$;
  end if;
end
$$;

alter table if exists public.mightycall_recordings
  add column if not exists external_id text,
  add column if not exists recorded_at timestamptz,
  add column if not exists recording_date timestamptz,
  add column if not exists phone_number_id uuid,
  add column if not exists call_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists direction text,
  add column if not exists business_number text,
  add column if not exists external_call_id text,
  add column if not exists external_recording_id text;

update public.mightycall_recordings
set
  recording_date = coalesce(recording_date, recorded_at, created_at),
  recorded_at = coalesce(recorded_at, recording_date, created_at),
  metadata = coalesce(metadata, '{}'::jsonb),
  external_id = coalesce(external_id, call_id, recording_url),
  from_number = coalesce(from_number, metadata->>'from_number'),
  to_number = coalesce(to_number, metadata->>'to_number')
where recording_date is null
   or recorded_at is null
   or metadata is null
   or external_id is null
   or from_number is null
   or to_number is null;

create unique index if not exists mightycall_recordings_org_external_unique
  on public.mightycall_recordings (org_id, external_id)
  where external_id is not null;

create index if not exists mightycall_reports_org_type_date_idx
  on public.mightycall_reports (org_id, report_type, report_date desc);

create index if not exists mightycall_recordings_org_recording_date_idx
  on public.mightycall_recordings (org_id, recording_date desc);

commit;
