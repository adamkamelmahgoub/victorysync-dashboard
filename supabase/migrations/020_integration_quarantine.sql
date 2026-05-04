create table if not exists public.integration_quarantine (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  integration_type text not null,
  source_org_id uuid null references public.organizations(id) on delete set null,
  external_id text null,
  detected_numbers text[] not null default '{}',
  candidate_org_ids uuid[] not null default '{}',
  reason text not null,
  raw_payload jsonb null,
  repaired_at timestamptz null,
  repair_note text null,
  created_at timestamptz not null default now()
);

alter table public.integration_quarantine
add column if not exists dedupe_key text;

update public.integration_quarantine
set dedupe_key = md5(
  integration_type || ':' ||
  coalesce(source_org_id::text, '') || ':' ||
  coalesce(external_id, '') || ':' ||
  reason
)
where dedupe_key is null;

alter table public.integration_quarantine
alter column dedupe_key set not null;

create unique index if not exists integration_quarantine_dedupe_key_unique
on public.integration_quarantine (dedupe_key);

create index if not exists integration_quarantine_type_created_idx
on public.integration_quarantine (integration_type, created_at desc);

create index if not exists integration_quarantine_source_org_idx
on public.integration_quarantine (source_org_id);

alter table public.integration_quarantine enable row level security;

drop policy if exists "integration_quarantine_platform_admin_all" on public.integration_quarantine;
create policy "integration_quarantine_platform_admin_all"
on public.integration_quarantine
for all
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.global_role in ('platform_admin', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.global_role in ('platform_admin', 'admin')
  )
);
