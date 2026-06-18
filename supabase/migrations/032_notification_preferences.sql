create table if not exists public.notification_preferences (
  user_id uuid primary key,
  org_id uuid null,
  email text null,
  billing_emails boolean not null default true,
  payment_emails boolean not null default true,
  account_emails boolean not null default true,
  organization_emails boolean not null default true,
  dashboard_update_emails boolean not null default false,
  lead_emails boolean not null default false,
  support_emails boolean not null default false,
  sync_emails boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_org_id_idx
  on public.notification_preferences (org_id);

create index if not exists notification_preferences_email_idx
  on public.notification_preferences (lower(email));

alter table public.notification_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_preferences'
      and policyname = 'notification_preferences_self_read'
  ) then
    create policy notification_preferences_self_read
      on public.notification_preferences
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_preferences'
      and policyname = 'notification_preferences_self_write'
  ) then
    create policy notification_preferences_self_write
      on public.notification_preferences
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
