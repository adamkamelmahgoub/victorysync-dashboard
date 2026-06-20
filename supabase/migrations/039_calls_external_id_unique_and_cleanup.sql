-- Ensure MightyCall call sync can upsert by either external_id or external_call_id.
-- Existing deployments may only have one of these unique indexes.

alter table if exists public.calls
  add column if not exists external_id text,
  add column if not exists external_call_id text;

update public.calls
set external_id = coalesce(external_id, external_call_id),
    external_call_id = coalesce(external_call_id, external_id)
where external_id is null
   or external_call_id is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, coalesce(external_call_id, external_id)
      order by coalesce(started_at, created_at) desc nulls last, id desc
    ) as rn
  from public.calls
  where coalesce(external_call_id, external_id) is not null
)
delete from public.calls c
using ranked
where c.id = ranked.id
  and ranked.rn > 1;

drop index if exists public.calls_org_external_id_idx;
drop index if exists public.calls_org_external_call_id_idx;

create unique index calls_org_external_id_idx
on public.calls(org_id, external_id);

create unique index calls_org_external_call_id_idx
on public.calls(org_id, external_call_id);
