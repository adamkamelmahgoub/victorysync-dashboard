begin;

alter table public.crm_deals add column if not exists amount numeric(14,2) not null default 0;
alter table public.crm_deals add column if not exists currency text not null default 'USD';
alter table public.crm_deals add column if not exists probability integer not null default 0 check(probability between 0 and 100);
alter table public.crm_deals add column if not exists close_date date;

create table if not exists public.crm_products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, sku text, description text, unit_price numeric(14,2) not null default 0, currency text not null default 'USD', active boolean not null default true,
  custom_fields jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,sku)
);
create table if not exists public.crm_deal_line_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid not null references public.crm_deals(id) on delete cascade, product_id uuid references public.crm_products(id) on delete set null,
  name text not null, quantity numeric(12,2) not null default 1, unit_price numeric(14,2) not null default 0, discount_percent numeric(5,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_quotes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid not null references public.crm_deals(id) on delete cascade, quote_number text not null, status text not null default 'draft' check(status in ('draft','sent','accepted','rejected','expired')),
  title text not null, subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  expires_at timestamptz, terms text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,quote_number)
);
create table if not exists public.sales_sequences (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, active boolean not null default false, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sales_sequence_steps (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.sales_sequences(id) on delete cascade, position integer not null, type text not null check(type in ('email','call','task')), delay_days integer not null default 0,
  subject text, body text, task_title text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(sequence_id,position)
);
create table if not exists public.sales_sequence_enrollments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.sales_sequences(id) on delete cascade, contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  status text not null default 'active' check(status in ('active','paused','completed','unenrolled')), current_step integer not null default 1, next_action_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(sequence_id,contact_id)
);
create table if not exists public.crm_meetings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete cascade, contact_id uuid references public.crm_contacts(id) on delete set null, deal_id uuid references public.crm_deals(id) on delete set null,
  title text not null, starts_at timestamptz not null, ends_at timestamptz not null, location text, notes text, outcome text, assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sales_goals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade, name text not null, metric text not null check(metric in ('revenue','deals_won','calls','meetings')),
  target_value numeric(14,2) not null, period_start date not null, period_end date not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin foreach t in array array['crm_products','crm_deal_line_items','crm_quotes','sales_sequences','sales_sequence_steps','sales_sequence_enrollments','crm_meetings','sales_goals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for all using (public.crm_user_in_org(organization_id)) with check (public.crm_user_in_org(organization_id))',t||'_internal_access',t);
  execute format('create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()',t||'_touch_updated_at',t);
end loop; end $$;
create index if not exists crm_quotes_deal_idx on public.crm_quotes(deal_id,created_at desc);
create index if not exists crm_meetings_time_idx on public.crm_meetings(organization_id,starts_at);
create index if not exists sequence_enrollments_next_idx on public.sales_sequence_enrollments(organization_id,status,next_action_at);

commit;
