-- Review and apply in staging first. Supabase Auth is intentionally retained.
begin;
create table public.wf_users (
  user_id uuid primary key references public.profiles(id),
  role text not null check (role in ('admin','agent','client')),
  display_name text not null default ''
);
create or replace function public.wf_role() returns text language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select case when p.global_role::text in ('platform_admin','admin','super_admin') then 'admin' end from profiles p where p.id=auth.uid()),
 (select role from wf_users where user_id=auth.uid()), 'unassigned');
$$;
create table public.wf_clients (
 id uuid primary key references public.organizations(id), name text not null,
 timezone text not null default 'America/New_York', screenshots_enabled boolean not null default false
);
create table public.wf_client_members (
 client_id uuid references public.wf_clients(id) on delete cascade,
 user_id uuid references public.wf_users(user_id) on delete cascade, primary key(client_id,user_id)
);
create table public.wf_campaigns (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.wf_clients(id),
 name text not null check(length(name) between 1 and 200), active boolean not null default true, unique(id,client_id)
);
create table public.wf_assignments (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.wf_users(user_id),
 campaign_id uuid not null, client_id uuid not null, active boolean not null default true,
 unique(agent_id,campaign_id), foreign key(campaign_id,client_id) references public.wf_campaigns(id,client_id)
);
create or replace function public.wf_client_access(cid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.wf_role()='admin' or (public.wf_role()='client' and exists(select 1 from wf_client_members where client_id=cid and user_id=auth.uid()));
$$;
create or replace function public.wf_assigned(aid uuid,cid uuid,pid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from wf_assignments a join wf_campaigns c on c.id=a.campaign_id
 where a.agent_id=aid and a.client_id=cid and a.campaign_id=pid and a.active and c.active
 and exists(select 1 from wf_users u where u.user_id=aid and u.role='agent'));
$$;
create or replace function public.wf_visible(aid uuid,cid uuid,pid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select wf_role()='admin' or (wf_role()='agent' and aid=auth.uid()) or
 (wf_role()='client' and wf_client_access(cid) and wf_assigned(aid,cid,pid));
$$;
create table public.wf_settings (
 id boolean primary key default true check(id), cap_timezone text not null default 'Africa/Cairo',
 idle_minutes integer not null default 10 check(idle_minutes between 1 and 120),
 screenshot_min_minutes integer not null default 5 check(screenshot_min_minutes between 1 and 120),
 screenshot_max_minutes integer not null default 10 check(screenshot_max_minutes between screenshot_min_minutes and 120),
 screenshots_enabled boolean not null default false, blur_screenshots boolean not null default true,
 window_titles_enabled boolean not null default false, retention_days integer not null default 30 check(retention_days between 1 and 365)
);
insert into wf_settings default values;
create table public.wf_limits (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references wf_users(user_id), client_id uuid references wf_clients(id),
 daily_minutes integer check(daily_minutes between 1 and 1440), weekly_minutes integer check(weekly_minutes between 1 and 10080),
 check(daily_minutes is not null or weekly_minutes is not null)
);
create unique index wf_limits_scope on wf_limits(agent_id,coalesce(client_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.wf_overrides (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references wf_users(user_id), client_id uuid references wf_clients(id),
 period text not null check(period in ('day','week')), period_start timestamptz not null,
 extra_minutes integer not null check(extra_minutes between 1 and 10080), expires_at timestamptz not null,
 reason text not null check(length(trim(reason)) between 3 and 2000), created_by uuid not null default auth.uid(), created_at timestamptz not null default now()
);
create table public.wf_sessions (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references wf_users(user_id), client_id uuid not null,
 campaign_id uuid not null, started_at timestamptz not null default now(), ended_at timestamptz, tracker_seen_at timestamptz,
 status text not null default 'working' check(status in ('working','break','stopped')),
 stop_reason text, review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
 foreign key(campaign_id,client_id) references wf_campaigns(id,client_id), check(ended_at is null or ended_at>=started_at)
);
create unique index wf_one_open_session on wf_sessions(agent_id) where ended_at is null;
create table public.wf_segments (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references wf_sessions(id),
 started_at timestamptz not null default now(), ended_at timestamptz, authorized_until timestamptz not null,
 idle_flag boolean not null default false, check(ended_at is null or ended_at>=started_at), check(authorized_until>=started_at)
);
create unique index wf_one_open_segment on wf_segments(session_id) where ended_at is null;
create index wf_sessions_agent_time on wf_sessions(agent_id,started_at);
create index wf_segments_session_time on wf_segments(session_id,started_at);
create table public.wf_transfers (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references wf_users(user_id), client_id uuid not null, campaign_id uuid not null,
 occurred_at timestamptz not null default now(), lead_name text not null default '', phone text not null,
 state text not null default '', qualifying_details jsonb not null default '{}', notes text not null default '',
 outcome text check(outcome in ('connected','no_answer','callback_requested','disqualified')),
 source text not null default 'manual' check(source in ('manual','mightycall')), source_key text,
 foreign key(campaign_id,client_id) references wf_campaigns(id,client_id), unique(client_id,source_key),
 check(length(phone) between 7 and 30), check(length(notes)<=4000), check(length(lead_name)<=200), check(length(state)<=50)
);
create index wf_transfers_scope_time on wf_transfers(client_id,campaign_id,occurred_at);
create table public.wf_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid default auth.uid(), occurred_at timestamptz not null default now(),
 entity text not null, entity_id uuid, action text not null, reason text, before_value jsonb, after_value jsonb
);
create or replace function public.wf_audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into wf_audit(entity,entity_id,action,reason,before_value,after_value)
 values(tg_table_name,case when tg_table_name='wf_settings' then null else coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid,(to_jsonb(new)->>'user_id')::uuid,(to_jsonb(old)->>'user_id')::uuid) end,tg_op,
 nullif(current_setting('wf.reason',true),''),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end; $$;

-- Seed identities conservatively. Existing tenant admins become read-only clients,
-- never platform administrators. Campaign assignments are explicitly configured.
insert into wf_users(user_id,role,display_name)
 select p.id,case when p.global_role::text in ('platform_admin','admin','super_admin') then 'admin'
 when exists(select 1 from org_users o where o.user_id=p.id and o.role::text='agent') then 'agent' else 'client' end,
 coalesce(p.full_name,p.email,'') from profiles p;
insert into wf_clients(id,name) select id,name from organizations;
insert into wf_client_members(client_id,user_id)
 select distinct o.org_id,o.user_id from org_users o join wf_users u on u.user_id=o.user_id and u.role='client' join wf_clients c on c.id=o.org_id;

-- Explicit policy for each workforce table. Internal tables have no user mutations.
do $$ declare t text; begin
 foreach t in array array['wf_users','wf_clients','wf_client_members','wf_campaigns','wf_assignments','wf_settings','wf_limits','wf_overrides','wf_sessions','wf_segments','wf_transfers','wf_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy workforce_admin_read on public.%I for select to authenticated using (public.wf_role()=''admin'')',t);
 end loop;
 foreach t in array array['wf_users','wf_clients','wf_client_members','wf_campaigns','wf_assignments','wf_settings','wf_limits'] loop
 execute format('grant insert,update,delete on public.%I to authenticated',t);
 execute format('create policy workforce_admin_write on public.%I for all to authenticated using (public.wf_role()=''admin'') with check (public.wf_role()=''admin'')',t);
 execute format('create trigger workforce_audit after insert or update or delete on public.%I for each row execute function public.wf_audit_change()',t);
 end loop;
end $$;
create policy workforce_user_read on wf_users for select to authenticated using(user_id=auth.uid() or (wf_role()='client' and exists(select 1 from wf_assignments a where a.agent_id=wf_users.user_id and a.active and wf_client_access(a.client_id))));
create policy workforce_client_read on wf_clients for select to authenticated using(wf_client_access(id) or exists(select 1 from wf_assignments where agent_id=auth.uid() and client_id=wf_clients.id and active));
create policy workforce_membership_read on wf_client_members for select to authenticated using(user_id=auth.uid());
create policy workforce_campaign_read on wf_campaigns for select to authenticated using(wf_client_access(client_id) or wf_assigned(auth.uid(),client_id,id));
create policy workforce_assignment_read on wf_assignments for select to authenticated using(agent_id=auth.uid() or wf_client_access(client_id));
create policy workforce_settings_read on wf_settings for select to authenticated using(wf_role()='agent');
create policy workforce_limits_read on wf_limits for select to authenticated using(wf_role()='agent' and agent_id=auth.uid());
create policy workforce_override_read on wf_overrides for select to authenticated using(wf_role()='agent' and agent_id=auth.uid());
create policy workforce_session_read on wf_sessions for select to authenticated using(wf_visible(agent_id,client_id,campaign_id));
create policy workforce_segment_read on wf_segments for select to authenticated using(exists(select 1 from wf_sessions s where s.id=session_id and wf_visible(s.agent_id,s.client_id,s.campaign_id)));
create policy workforce_transfer_read on wf_transfers for select to authenticated using(wf_visible(agent_id,client_id,campaign_id));

-- Protect security attributes even when an old profile policy grants self-update.
create or replace function public.wf_protect_profile() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is not null and wf_role()<>'admin' and
 (to_jsonb(new)-array['full_name','updated_at']) is distinct from (to_jsonb(old)-array['full_name','updated_at']) then
 raise exception 'Profile security fields require an administrator' using errcode='42501'; end if;
 return new;
end; $$;
create trigger wf_protect_profile before update on profiles for each row execute function wf_protect_profile();

-- Remove unsafe legacy permissions. Restrictive guards also cap any historical
-- permissive policies. Shared service-role workers retain their existing access.
do $$ declare t record; policy_row record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not like 'wf\_%' escape '\' loop
 -- Replace historical policies so revoked legacy RPCs cannot execute through them.
 for policy_row in select policyname from pg_policies where schemaname='public' and tablename=t.tablename loop
 execute format('drop policy %I on public.%I',policy_row.policyname,t.tablename);
 end loop;
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('create policy workforce_legacy_boundary on public.%I as restrictive for all to anon,authenticated using (public.wf_role()=''admin'') with check (public.wf_role()=''admin'')',t.tablename);
 execute format('create policy workforce_legacy_admin on public.%I for all to authenticated using (public.wf_role()=''admin'') with check (public.wf_role()=''admin'')',t.tablename);
 end loop;
 -- Old security-definer RPCs can bypass table RLS. Only reviewed workforce
 -- functions are callable by end users after this migration.
 for t in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname not like 'wf\_%' escape '\' loop
 execute format('revoke execute on function %s from public,anon,authenticated',t.signature);
 execute format('grant execute on function %s to service_role',t.signature);
 end loop;
 -- Views can execute as their owner. Remove end-user access to legacy views.
 for t in select c.relname as table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') loop
 execute format('revoke all on public.%I from public,anon,authenticated',t.table_name);
 end loop;
end $$;
revoke all on all tables in schema public from anon;
revoke all on function wf_role(),wf_client_access(uuid),wf_assigned(uuid,uuid,uuid),wf_visible(uuid,uuid,uuid),wf_audit_change(),wf_protect_profile() from public;
grant execute on function wf_role(),wf_client_access(uuid),wf_assigned(uuid,uuid,uuid),wf_visible(uuid,uuid,uuid) to authenticated;
commit;
