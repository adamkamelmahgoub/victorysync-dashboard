begin;

create table if not exists public.crm_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_type text not null check (object_type in ('companies','contacts','deals','tasks')),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, object_type, name)
);

create table if not exists public.crm_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  object_type text not null check (object_type in ('companies','contacts')),
  file_name text,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  total_rows integer not null default 0,
  inserted_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists crm_saved_views_user_idx on public.crm_saved_views(organization_id,user_id,object_type);
create index if not exists crm_import_jobs_org_time_idx on public.crm_import_jobs(organization_id,created_at desc);
alter table public.crm_saved_views enable row level security;
alter table public.crm_import_jobs enable row level security;
create policy crm_saved_views_internal_access on public.crm_saved_views for all using (public.crm_user_in_org(organization_id)) with check (public.crm_user_in_org(organization_id));
create policy crm_import_jobs_internal_access on public.crm_import_jobs for all using (public.crm_user_in_org(organization_id)) with check (public.crm_user_in_org(organization_id));
create trigger crm_saved_views_touch_updated_at before update on public.crm_saved_views for each row execute function public.crm_touch_updated_at();

commit;
