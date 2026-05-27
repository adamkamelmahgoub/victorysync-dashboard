begin;

alter table if exists public.lead_sources
  add column if not exists campaign_name text,
  add column if not exists source_label text,
  add column if not exists description text,
  add column if not exists routing_priority integer not null default 100,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.leads
  add column if not exists lead_source_id uuid references public.lead_sources(id) on delete set null,
  add column if not exists campaign_id text,
  add column if not exists campaign_name text;

create index if not exists idx_leads_lead_source_id on public.leads(lead_source_id);
create index if not exists idx_leads_campaign_id on public.leads(campaign_id);
create index if not exists idx_leads_lead_type on public.leads(lead_type);
create index if not exists idx_lead_sources_type_lookup
  on public.lead_sources(source_name, campaign_id, lead_type, active, routing_priority);

create or replace function public.touch_lead_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists lead_sources_touch_updated_at on public.lead_sources;
create trigger lead_sources_touch_updated_at
before update on public.lead_sources
for each row execute function public.touch_lead_sources_updated_at();

drop policy if exists lead_sources_org_update on public.lead_sources;
create policy lead_sources_org_update
on public.lead_sources
for update
using (public.current_user_in_org(organization_id))
with check (public.current_user_in_org(organization_id));

commit;
