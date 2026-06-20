-- Keep MightyCall number ownership compatible across older and newer deployments.
-- Calls, recordings, SMS, and reports depend on these mappings for org-scoped data.

alter table if exists public.phone_numbers
  add column if not exists number text,
  add column if not exists phone_number text,
  add column if not exists number_digits text,
  add column if not exists e164 text,
  add column if not exists is_active boolean default true,
  add column if not exists metadata jsonb,
  add column if not exists last_synced_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update public.phone_numbers
set number = coalesce(number, phone_number, e164),
    phone_number = coalesce(phone_number, number, e164),
    number_digits = coalesce(number_digits, regexp_replace(coalesce(number, phone_number, e164, ''), '\D', '', 'g')),
    e164 = coalesce(e164, number, phone_number),
    updated_at = coalesce(updated_at, now())
where number is null
   or phone_number is null
   or number_digits is null
   or e164 is null
   or updated_at is null;

create table if not exists public.org_phone_numbers (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  phone_number_id uuid references public.phone_numbers(id) on delete cascade,
  phone_number text,
  label text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.org_phone_numbers (org_id, phone_number_id, phone_number, label)
select pn.org_id, pn.id, coalesce(pn.number, pn.phone_number, pn.e164), pn.label
from public.phone_numbers pn
where pn.org_id is not null
  and not exists (
    select 1
    from public.org_phone_numbers opn
    where opn.org_id = pn.org_id
      and opn.phone_number_id = pn.id
  );

with ranked_phone_id as (
  select
    id,
    row_number() over (partition by org_id, phone_number_id order by created_at desc nulls last, id desc) as rn
  from public.org_phone_numbers
  where phone_number_id is not null
)
delete from public.org_phone_numbers opn
using ranked_phone_id r
where opn.id = r.id
  and r.rn > 1;

with ranked_phone_text as (
  select
    id,
    row_number() over (partition by org_id, phone_number order by created_at desc nulls last, id desc) as rn
  from public.org_phone_numbers
  where phone_number is not null
)
delete from public.org_phone_numbers opn
using ranked_phone_text r
where opn.id = r.id
  and r.rn > 1;

drop index if exists public.org_phone_numbers_org_phone_id_idx;
drop index if exists public.org_phone_numbers_org_phone_text_idx;

create unique index org_phone_numbers_org_phone_id_idx
on public.org_phone_numbers(org_id, phone_number_id);

create unique index org_phone_numbers_org_phone_text_idx
on public.org_phone_numbers(org_id, phone_number);

create index if not exists phone_numbers_org_id_idx
on public.phone_numbers(org_id);

create index if not exists phone_numbers_number_digits_idx
on public.phone_numbers(number_digits);
