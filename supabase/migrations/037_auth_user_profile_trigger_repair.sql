-- Repair Supabase Auth -> profiles trigger used by invites/signups.
-- Supabase returns "Database error saving new user" when this trigger throws.

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists global_role text,
  add column if not exists can_upload_leads boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%global_role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_global_role_allowed
  check (
    global_role is null
    or global_role in ('platform_admin', 'platform_manager', 'admin', 'super_admin')
  );

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_global_role text;
begin
  requested_global_role := new.raw_user_meta_data->>'global_role';
  if requested_global_role not in ('platform_admin', 'platform_manager', 'admin', 'super_admin') then
    requested_global_role := null;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    global_role,
    can_upload_leads,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    requested_global_role,
    false,
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        global_role = coalesce(public.profiles.global_role, excluded.global_role),
        updated_at = now();

  return new;
exception
  when others then
    raise warning 'handle_new_auth_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
