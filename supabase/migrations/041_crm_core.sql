begin;

create or replace function public.crm_user_in_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.org_users ou
      where ou.org_id = target_org_id and ou.user_id = auth.uid()
    )
    or exists (
      select 1 from public.org_members om
      where om.org_id = target_org_id and om.user_id = auth.uid()
    );
$$;

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  city text,
  state text,
  industry text,
  source text,
  notes text,
  tags text[] not null default '{}'::text[],
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  source_lead_id uuid unique references public.leads(id) on delete set null,
  first_name text not null,
  last_name text,
  title text,
  phone text,
  email text,
  tags text[] not null default '{}'::text[],
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint crm_contacts_company_fk foreign key (company_id)
    references public.crm_companies(id) on delete set null
);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0),
  color text,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, position),
  unique (organization_id, id)
);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null,
  primary_contact_id uuid,
  stage_id uuid not null,
  title text not null,
  next_action text,
  assigned_to uuid references auth.users(id) on delete set null,
  source_lead_id uuid references public.leads(id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  stage_changed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint crm_deals_company_fk foreign key (company_id)
    references public.crm_companies(id) on delete cascade,
  constraint crm_deals_contact_fk foreign key (primary_contact_id)
    references public.crm_contacts(id) on delete set null,
  constraint crm_deals_stage_fk foreign key (stage_id)
    references public.crm_pipeline_stages(id) on delete restrict
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  deal_id uuid,
  type text not null check (type in ('call', 'note', 'email', 'task', 'stage_change')),
  body text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_activities_company_fk foreign key (company_id)
    references public.crm_companies(id) on delete cascade,
  constraint crm_activities_contact_fk foreign key (contact_id)
    references public.crm_contacts(id) on delete set null,
  constraint crm_activities_deal_fk foreign key (deal_id)
    references public.crm_deals(id) on delete set null
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  deal_id uuid,
  title text not null,
  description text,
  due_date timestamptz not null,
  completed boolean not null default false,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_company_fk foreign key (company_id)
    references public.crm_companies(id) on delete cascade,
  constraint crm_tasks_contact_fk foreign key (contact_id)
    references public.crm_contacts(id) on delete set null,
  constraint crm_tasks_deal_fk foreign key (deal_id)
    references public.crm_deals(id) on delete set null
);

create table if not exists public.call_outcome_stage_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outcome text not null,
  target_stage_id uuid not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, outcome),
  constraint call_outcome_stage_fk foreign key (target_stage_id)
    references public.crm_pipeline_stages(id) on delete cascade
);

create index if not exists crm_companies_org_name_idx on public.crm_companies (organization_id, name);
create index if not exists crm_companies_org_industry_idx on public.crm_companies (organization_id, industry);
create index if not exists crm_contacts_org_name_idx on public.crm_contacts (organization_id, last_name, first_name);
create index if not exists crm_contacts_org_email_idx on public.crm_contacts (organization_id, lower(email));
create index if not exists crm_contacts_org_phone_idx on public.crm_contacts (organization_id, phone);
create index if not exists crm_pipeline_stages_org_position_idx on public.crm_pipeline_stages (organization_id, position);
create index if not exists crm_deals_org_stage_idx on public.crm_deals (organization_id, stage_id, updated_at desc);
create index if not exists crm_activities_company_time_idx on public.crm_activities (organization_id, company_id, occurred_at desc);
create index if not exists crm_tasks_assignee_due_idx on public.crm_tasks (organization_id, assigned_to, completed, due_date);

create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'crm_companies', 'crm_contacts', 'crm_pipeline_stages', 'crm_deals',
    'crm_activities', 'crm_tasks', 'call_outcome_stage_mappings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  end loop;
end $$;

create or replace function public.seed_crm_pipeline_stages(target_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_pipeline_stages (organization_id, name, position, color, is_closed, is_won)
  values
    (target_org_id, 'New', 10, 'slate', false, false),
    (target_org_id, 'Contacted', 20, 'sky', false, false),
    (target_org_id, 'Engaged', 30, 'violet', false, false),
    (target_org_id, 'Qualified', 40, 'indigo', false, false),
    (target_org_id, 'Trial Booked', 50, 'amber', false, false),
    (target_org_id, 'Trial Active', 60, 'orange', false, false),
    (target_org_id, 'Trial Completed', 70, 'teal', false, false),
    (target_org_id, 'Client', 80, 'emerald', true, true),
    (target_org_id, 'Disqualified', 90, 'rose', true, false)
  on conflict (organization_id, name) do nothing;
end;
$$;

select public.seed_crm_pipeline_stages(id) from public.organizations;

create or replace function public.crm_seed_stages_for_new_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_crm_pipeline_stages(new.id);
  return new;
end;
$$;

drop trigger if exists organizations_seed_crm_stages on public.organizations;
create trigger organizations_seed_crm_stages
after insert on public.organizations
for each row execute function public.crm_seed_stages_for_new_org();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'crm_companies', 'crm_contacts', 'crm_pipeline_stages', 'crm_deals',
    'crm_activities', 'crm_tasks', 'call_outcome_stage_mappings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_org_access', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.crm_user_in_org(organization_id)) with check (public.crm_user_in_org(organization_id))',
      table_name || '_org_access', table_name
    );
  end loop;
end $$;

commit;
