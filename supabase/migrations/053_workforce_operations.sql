begin;
-- Administrator-managed provider routes avoid guessing a campaign or agent.
create table public.wf_provider_routes (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references wf_users(user_id),
 client_id uuid not null, campaign_id uuid not null, extension text not null, business_number text not null,
 active boolean not null default true, unique(extension,business_number),
 foreign key(campaign_id,client_id) references wf_campaigns(id,client_id)
);
create table public.wf_transfer_inbox (
 id uuid primary key default gen_random_uuid(), source_key text not null unique,
 received_at timestamptz not null default now(), payload jsonb not null, reason text not null, resolved boolean not null default false
);
alter table wf_provider_routes enable row level security;
alter table wf_transfer_inbox enable row level security;
grant select,insert,update,delete on wf_provider_routes,wf_transfer_inbox to authenticated;
create policy admin_routes on wf_provider_routes for all to authenticated using(wf_role()='admin') with check(wf_role()='admin');
create policy admin_transfer_inbox on wf_transfer_inbox for all to authenticated using(wf_role()='admin') with check(wf_role()='admin');
create trigger workforce_audit after insert or update or delete on wf_provider_routes for each row execute function wf_audit_change();
create trigger workforce_audit after insert or update or delete on wf_transfer_inbox for each row execute function wf_audit_change();
grant insert,update,delete on wf_transfers to authenticated;
create policy admin_transfer_write on wf_transfers for all to authenticated using(wf_role()='admin') with check(wf_role()='admin');
create trigger workforce_transfer_audit after update or delete on wf_transfers for each row execute function wf_audit_change();
-- Even historical permissive storage policies cannot permit replacement or deletion.
create policy workforce_no_user_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'workforce-screenshots' or wf_role()='admin');
create policy workforce_admin_delete on storage.objects for delete to authenticated using(bucket_id='workforce-screenshots' and wf_role()='admin');
grant delete on wf_screenshots to authenticated;
create policy workforce_admin_screenshot_delete on wf_screenshots for delete to authenticated using(wf_role()='admin');
create trigger workforce_screenshot_delete_audit after delete on wf_screenshots for each row execute function wf_audit_change();
create policy workforce_no_user_replace on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'workforce-screenshots') with check(bucket_id<>'workforce-screenshots');
create function public.wf_ingest_transfer(event jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare route wf_provider_routes; result_id uuid; why text; happened timestamptz; status text;
begin
 if nullif(event->>'source_key','') is null then raise exception 'Provider event identity required'; end if;
 select * into route from wf_provider_routes where active and client_id=(event->>'client_id')::uuid and extension=event->>'extension'
 and business_number=regexp_replace(event->>'business_number','[^0-9]','','g');
 if (event->>'identity_confirmed')::boolean is false then why:='Provider did not supply a stable transfer identity';
 elsif route.id is null then why:='Configure a unique provider route';
 elsif not wf_assigned(route.agent_id,route.client_id,route.campaign_id) then why:='Route has no active assignment';
 elsif nullif(event->>'occurred_at','') is null then why:='Provider did not supply a transfer timestamp';
 elsif length(coalesce(event->>'phone','')) not between 7 and 30 then why:='Provider did not supply a valid lead phone'; end if;
 if why is not null then
 insert into wf_transfer_inbox(source_key,payload,reason) values(event->>'source_key',event,why)
 on conflict(source_key) do update set payload=excluded.payload,reason=excluded.reason;
 return null;
 end if;
 happened:=(event->>'occurred_at')::timestamptz;
 status:=case lower(event->>'outcome') when 'connected' then 'connected' when 'answered' then 'connected'
 when 'no_answer' then 'no_answer' when 'no answer' then 'no_answer' when 'callback_requested' then 'callback_requested'
 when 'disqualified' then 'disqualified' else null end;
 insert into wf_transfers(agent_id,client_id,campaign_id,occurred_at,phone,outcome,source,source_key)
 values(route.agent_id,route.client_id,route.campaign_id,happened,event->>'phone',status,'mightycall',event->>'source_key')
 on conflict(client_id,source_key) do update set outcome=coalesce(excluded.outcome,wf_transfers.outcome)
 returning id into result_id;
 update wf_transfer_inbox set resolved=true where source_key=event->>'source_key';
 return result_id;
end; $$;
revoke all on function wf_ingest_transfer(jsonb) from public,anon,authenticated;
grant execute on function wf_ingest_transfer(jsonb) to service_role;
grant all on wf_provider_routes,wf_transfer_inbox to service_role;
-- Reject invalid timezone configuration at the point of change.
create function wf_validate_settings() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.cap_timezone) then raise exception 'Unknown cap timezone'; end if;
 return new;
end; $$;
create trigger wf_settings_timezone before insert or update on wf_settings for each row execute function wf_validate_settings();
revoke all on function wf_validate_settings() from public,anon,authenticated;
create index wf_screenshots_session_time on wf_screenshots(session_id,captured_at);
create index wf_client_members_user on wf_client_members(user_id,client_id);
create or replace function public.wf_sweep_timers() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; budget jsonb; cutoff timestamptz;
begin
 for s in select id,agent_id,client_id,campaign_id from wf_sessions where ended_at is null and status='working' loop
 perform pg_advisory_xact_lock(hashtextextended(s.agent_id::text,0));
 budget:=wf_budget(s.agent_id,s.client_id);
 cutoff:=now()+make_interval(secs=>(budget->>'remaining_seconds')::double precision);
 if not wf_assigned(s.agent_id,s.client_id,s.campaign_id) then cutoff:=now(); end if;
 update wf_segments set authorized_until=least(authorized_until,cutoff) where session_id=s.id and ended_at is null;
 perform wf_stop_expired(s.agent_id);
 end loop;
end; $$;
create function wf_admin_stop(aid uuid,reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s wf_sessions;
begin
 if wf_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if reason is null or length(trim(reason))<3 then raise exception 'A reason is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
 perform wf_stop_expired(aid);
 select * into s from wf_sessions where agent_id=aid and ended_at is null for update;
 if s.id is null then return; end if;
 update wf_segments set ended_at=least(now(),authorized_until) where session_id=s.id and ended_at is null;
 update wf_sessions set status='stopped',ended_at=now(),stop_reason='admin_stop' where id=s.id;
 insert into wf_audit(entity,entity_id,action,reason,before_value,after_value) values('wf_sessions',s.id,'admin_stop',reason,to_jsonb(s),(select to_jsonb(x) from wf_sessions x where id=s.id));
end; $$;
revoke all on function wf_admin_stop(uuid,text) from public,anon,authenticated;
grant execute on function wf_admin_stop(uuid,text) to authenticated;
-- New accounts and organizations created through existing admin tools appear here.
create function wf_seed_identity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into wf_users(user_id,role,display_name) values(new.id,case when new.global_role::text in ('platform_admin','admin','super_admin') then 'admin' else 'client' end,coalesce(new.full_name,new.email,'')) on conflict(user_id) do nothing;
 return new;
end; $$;
create trigger workforce_seed_identity after insert on profiles for each row execute function wf_seed_identity();
create function wf_seed_client() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into wf_clients(id,name) values(new.id,new.name) on conflict(id) do update set name=excluded.name;
 return new;
end; $$;
create trigger workforce_seed_client after insert or update of name on organizations for each row execute function wf_seed_client();
create function wf_revoke_legacy_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.role='admin' and old.role<>'admin' then
 update profiles set global_role='platform_admin' where id=new.user_id;
 elsif old.role='admin' and new.role<>'admin' then
 update profiles set global_role=null,is_global_admin=false where id=new.user_id and global_role::text in ('platform_admin','admin','super_admin');
 end if;
 return new;
end; $$;
create trigger workforce_revoke_legacy_admin before update of role on wf_users for each row execute function wf_revoke_legacy_admin();
revoke all on function wf_seed_identity(),wf_seed_client(),wf_revoke_legacy_admin() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wf_sessions') then
 alter publication supabase_realtime add table public.wf_sessions;
 end if;
end $$;
commit;
