begin;

-- Internal-only client lead workspaces. These tables intentionally have no
-- authenticated-user RLS policies: only the server service role may read or
-- write them through platform-admin guarded API routes.
create table if not exists public.admin_client_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  email text,
  company text,
  source text,
  status text not null default 'new',
  disposition text not null default 'unworked',
  priority text not null default 'normal',
  assigned_to text,
  attempts integer not null default 0,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  do_not_contact boolean not null default false,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_client_leads_contact_present check (
    nullif(trim(coalesce(phone, '')), '') is not null or
    nullif(trim(coalesce(email, '')), '') is not null
  ),
  constraint admin_client_leads_attempts_nonnegative check (attempts >= 0)
);

create table if not exists public.admin_client_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.admin_client_leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_type text not null,
  summary text not null,
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_client_leads_org_updated
  on public.admin_client_leads(organization_id, updated_at desc);
create index if not exists idx_admin_client_leads_org_status
  on public.admin_client_leads(organization_id, status);
create index if not exists idx_admin_client_leads_org_disposition
  on public.admin_client_leads(organization_id, disposition);
create index if not exists idx_admin_client_lead_activities_lead_created
  on public.admin_client_lead_activities(lead_id, created_at desc);

alter table public.admin_client_leads enable row level security;
alter table public.admin_client_lead_activities enable row level security;

create or replace function public.touch_admin_client_leads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists admin_client_leads_touch_updated_at on public.admin_client_leads;
create trigger admin_client_leads_touch_updated_at
before update on public.admin_client_leads
for each row execute function public.touch_admin_client_leads_updated_at();

commit;
