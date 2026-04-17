begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  org_id uuid null,
  action text not null,
  entity_type text null,
  entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_id_idx on public.audit_logs (org_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

create table if not exists public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null,
  encrypted_credentials text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_integrations_org_provider_unique unique (org_id, provider)
);

create index if not exists org_integrations_org_id_idx on public.org_integrations (org_id);
create index if not exists org_integrations_provider_idx on public.org_integrations (provider);

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  if row_to_json(new)::jsonb ? 'updated_at' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_row_updated_at();

commit;
