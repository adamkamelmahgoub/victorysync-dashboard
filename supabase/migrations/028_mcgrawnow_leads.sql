begin;

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  campaign_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_type text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  first_name text,
  last_name text,
  phone text not null,
  email text,
  state text,
  debt_amount numeric,
  lead_type text default 'debt_relief',
  opt_in_source text,
  ip_address text,
  tcpa_consent boolean default false,
  tcpa_timestamp timestamptz,
  status text default 'new',
  assigned_agent_id uuid references auth.users(id),
  assigned_at timestamptz,
  contacted_at timestamptz,
  transferred_at timestamptz,
  call_attempts integer default 0,
  notes text,
  source text default 'mcgrawnow',
  source_lead_id text,
  raw_payload jsonb,
  received_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lead_duplicates (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  source_lead_id text,
  received_at timestamptz default now(),
  original_lead_id uuid references public.leads(id) on delete set null,
  raw_payload jsonb,
  source text default 'mcgrawnow'
);

create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_org_id on public.leads(organization_id);
create index if not exists idx_leads_received_at on public.leads(received_at desc);
create index if not exists idx_leads_assigned_agent on public.leads(assigned_agent_id);
create index if not exists idx_leads_phone on public.leads(phone);
create index if not exists idx_leads_phone_received_at on public.leads(phone, received_at desc);
create index if not exists idx_leads_source on public.leads(source);
create index if not exists idx_lead_sources_lookup on public.lead_sources(source_name, campaign_id, active);
create index if not exists idx_lead_sources_org on public.lead_sources(organization_id);
create index if not exists idx_lead_duplicates_phone_received_at on public.lead_duplicates(phone, received_at desc);

alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;
alter table public.lead_duplicates enable row level security;

create or replace function public.touch_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
before update on public.leads
for each row execute function public.touch_leads_updated_at();

drop policy if exists leads_org_select on public.leads;
create policy leads_org_select
on public.leads
for select
using (
  public.current_user_in_org(organization_id)
);

drop policy if exists leads_org_update on public.leads;
create policy leads_org_update
on public.leads
for update
using (public.current_user_in_org(organization_id))
with check (public.current_user_in_org(organization_id));

drop policy if exists lead_sources_admin_select on public.lead_sources;
create policy lead_sources_admin_select
on public.lead_sources
for select
using (
  public.current_user_in_org(organization_id)
);

drop policy if exists lead_duplicates_admin_select on public.lead_duplicates;
create policy lead_duplicates_admin_select
on public.lead_duplicates
for select
using (
  exists (
    select 1
    from public.leads l
    where l.id = lead_duplicates.original_lead_id
      and public.current_user_in_org(l.organization_id)
  )
);

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end
$$;

commit;
