-- Remove fake/unplayable recording rows created by old demo seeds or call-row fallbacks.
delete from public.mightycall_recordings
where recording_url is null
   or btrim(recording_url) = ''
   or recording_url ilike 'https://example.com/demo/%'
   or recording_url ilike 'http://example.com/demo/%';

-- Keep the newest row for each real org + recording URL pair.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, recording_url
      order by coalesce(recording_date, recorded_at, created_at) desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.mightycall_recordings
  where recording_url is not null
    and btrim(recording_url) <> ''
)
delete from public.mightycall_recordings r
using ranked
where r.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists mightycall_recordings_org_recording_url_unique
  on public.mightycall_recordings (org_id, recording_url)
  where recording_url is not null and btrim(recording_url) <> '';
