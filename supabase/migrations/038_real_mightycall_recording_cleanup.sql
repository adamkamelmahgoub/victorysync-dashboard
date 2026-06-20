-- Remove non-real/demo recording rows so the dashboard only lists playable MightyCall assets.
delete from public.mightycall_recordings
where recording_url is null
   or btrim(recording_url) = ''
   or recording_url !~* '^https?://'
   or recording_url ~* '^https?://(www\.)?example\.com/'
   or recording_url ~* '/demo/'
   or recording_url ~* 'recording-demo|demo-recording';

with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, recording_url
      order by coalesce(recording_date, recorded_at, created_at) desc nulls last, id desc
    ) as rn
  from public.mightycall_recordings
  where recording_url is not null
    and btrim(recording_url) <> ''
)
delete from public.mightycall_recordings r
using ranked
where r.id = ranked.id
  and ranked.rn > 1;
