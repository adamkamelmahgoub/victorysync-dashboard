begin;
create table public.wf_consents (
 user_id uuid not null references wf_users(user_id), disclosure_version text not null,
 accepted_at timestamptz not null default now(), primary key(user_id,disclosure_version)
);
create table public.wf_activity (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references wf_sessions(id),
 minute_at timestamptz not null, key_count integer not null check(key_count between 0 and 60000),
 click_count integer not null check(click_count between 0 and 60000), movement_count integer not null check(movement_count between 0 and 60000),
 app_name text, window_title text, unique(session_id,minute_at)
);
create table public.wf_screenshots (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references wf_sessions(id),
 object_path text unique not null, captured_at timestamptz not null default now(), expires_at timestamptz not null,
 blurred boolean not null, uploaded boolean not null default false
);
create index wf_screenshots_expiry on wf_screenshots(expires_at);
create table public.wf_retention_runs (id uuid primary key default gen_random_uuid(), ran_at timestamptz not null default now(), deleted_count integer not null, error_count integer not null);
do $$ declare t text; begin
 foreach t in array array['wf_consents','wf_activity','wf_screenshots','wf_retention_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy workforce_monitor_admin on public.%I for select to authenticated using(public.wf_role()=''admin'')',t);
 end loop;
end $$;
create policy consent_self on wf_consents for select to authenticated using(user_id=auth.uid());
create policy activity_self on wf_activity for select to authenticated using(exists(select 1 from wf_sessions s where s.id=session_id and s.agent_id=auth.uid()));
create policy screenshot_scope on wf_screenshots for select to authenticated using(expires_at>now() and exists(select 1 from wf_sessions s where s.id=session_id and (s.agent_id=auth.uid() or (wf_visible(s.agent_id,s.client_id,s.campaign_id) and exists(select 1 from wf_clients c where c.id=s.client_id and c.screenshots_enabled)))));
create or replace function public.wf_accept_monitoring(version text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if wf_role()<>'agent' or version<>'2026-09-29-v1' then raise exception 'Invalid monitoring consent' using errcode='42501'; end if;
 insert into wf_consents(user_id,disclosure_version) values(auth.uid(),version) on conflict do nothing;
end; $$;
create or replace function public.wf_record_activity(sid uuid,at_minute timestamptz,keys integer,clicks integer,movements integer,app text default null,title text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s wf_sessions; g wf_segments; cfg wf_settings;
begin
 if wf_role()<>'agent' then raise exception 'Agent access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from wf_sessions where id=sid and agent_id=auth.uid();
 if s.id is null or not exists(select 1 from wf_consents where user_id=auth.uid() and disclosure_version='2026-09-29-v1') then raise exception 'Session and monitoring consent required' using errcode='42501'; end if;
 if at_minute<>date_trunc('minute',at_minute) or at_minute<now()-interval '2 minutes' or at_minute>now() then raise exception 'Activity timestamp out of range'; end if;
 -- A sample must overlap authorized work, and never extend beyond the cap.
 select * into g from wf_segments where session_id=sid and started_at<at_minute+interval '1 minute'
 and least(coalesce(ended_at,now()),authorized_until)>at_minute limit 1;
 if g.id is null then raise exception 'No authorized work in this minute' using errcode='42501'; end if;
 select * into cfg from wf_settings where id;
 insert into wf_activity(session_id,minute_at,key_count,click_count,movement_count,app_name,window_title)
 values(sid,at_minute,keys,clicks,movements,case when cfg.window_titles_enabled then left(app,200) end,case when cfg.window_titles_enabled then left(title,500) end)
 on conflict(session_id,minute_at) do nothing;
end; $$;
create or replace function public.wf_prepare_screenshot(sid uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s wf_sessions; cfg wf_settings; shot wf_screenshots; key text;
begin
 if wf_role()<>'agent' then raise exception 'Agent access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform wf_stop_expired(auth.uid());
 select * into s from wf_sessions where id=sid and agent_id=auth.uid() and status='working' and ended_at is null;
 select * into cfg from wf_settings where id;
 if s.id is null or not cfg.screenshots_enabled or not wf_assigned(auth.uid(),s.client_id,s.campaign_id)
 or not exists(select 1 from wf_consents where user_id=auth.uid() and disclosure_version='2026-09-29-v1') then raise exception 'Screenshot capture is not authorized' using errcode='42501'; end if;
 if exists(select 1 from wf_screenshots where session_id=sid and captured_at>now()-make_interval(mins=>cfg.screenshot_min_minutes)) then raise exception 'Screenshot interval has not elapsed'; end if;
 key:=auth.uid()::text||'/'||sid::text||'/'||gen_random_uuid()::text||'.jpg';
 insert into wf_screenshots(session_id,object_path,expires_at,blurred) values(sid,key,now()+make_interval(days=>cfg.retention_days),cfg.blur_screenshots) returning * into shot;
 return to_jsonb(shot);
end; $$;
create or replace function public.wf_screenshot_allowed(path text,writing boolean) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from wf_screenshots p join wf_sessions s on s.id=p.session_id where p.object_path=path and p.expires_at>now() and
 case when writing then s.agent_id=auth.uid() and s.status='working' and s.ended_at is null
 and p.captured_at>now()-interval '30 seconds' and exists(select 1 from wf_segments g where g.session_id=s.id and g.ended_at is null and g.authorized_until>now())
 else wf_role()='admin' or s.agent_id=auth.uid() or (wf_visible(s.agent_id,s.client_id,s.campaign_id) and exists(select 1 from wf_clients c where c.id=s.client_id and c.screenshots_enabled)) end);
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('workforce-screenshots','workforce-screenshots',false,5242880,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive boundary stops pre-existing broad Storage policies exposing captures.
create policy workforce_screenshot_boundary on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'workforce-screenshots' or public.wf_screenshot_allowed(name,false))
 with check(bucket_id<>'workforce-screenshots' or public.wf_screenshot_allowed(name,true));
create policy workforce_screenshot_read on storage.objects for select to authenticated using(bucket_id='workforce-screenshots' and public.wf_screenshot_allowed(name,false));
create policy workforce_screenshot_upload on storage.objects for insert to authenticated with check(bucket_id='workforce-screenshots' and public.wf_screenshot_allowed(name,true));
revoke all on function wf_accept_monitoring(text),wf_record_activity(uuid,timestamptz,integer,integer,integer,text,text),wf_prepare_screenshot(uuid),wf_screenshot_allowed(text,boolean) from public,anon;
grant execute on function wf_accept_monitoring(text),wf_record_activity(uuid,timestamptz,integer,integer,integer,text,text),wf_prepare_screenshot(uuid),wf_screenshot_allowed(text,boolean) to authenticated;
grant all on all tables in schema public to service_role;
commit;
