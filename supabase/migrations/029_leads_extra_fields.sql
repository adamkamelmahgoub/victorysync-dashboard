begin;

-- Add trusted_id and form_number to leads
alter table public.leads
  add column if not exists trusted_id text,
  add column if not exists form_number text;

-- Add per-org visibility settings for the leads page
-- { "agents": true, "clients": true }
alter table public.organizations
  add column if not exists leads_visibility jsonb not null default '{"agents": true, "clients": true}'::jsonb;

create index if not exists idx_leads_trusted_id on public.leads(trusted_id);
create index if not exists idx_leads_form_number on public.leads(form_number);

commit;
