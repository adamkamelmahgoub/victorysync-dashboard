begin;
create or replace function public.wf_period(at_time timestamptz,kind text) returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
 select date_trunc(kind,at_time at time zone cap_timezone) at time zone cap_timezone from wf_settings where id;
$$;
create or replace function public.wf_usage(aid uuid,cid uuid,from_time timestamptz,to_time timestamptz) returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(greatest(0,extract(epoch from (least(coalesce(g.ended_at,to_time),g.authorized_until,to_time)-greatest(g.started_at,from_time))))),0)
 from wf_segments g join wf_sessions s on s.id=g.session_id where s.agent_id=aid and (cid is null or s.client_id=cid)
 and g.started_at<to_time and coalesce(g.ended_at,g.authorized_until)>from_time;
$$;
create or replace function public.wf_budget(aid uuid,cid uuid,at_time timestamptz default now()) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r record; kind text; cap numeric; used numeric; extra numeric; start_at timestamptz; end_at timestamptz;
 left_seconds numeric:=86400; percent numeric:=0; details jsonb:='[]'; tz text; override_end timestamptz;
begin
 select cap_timezone into tz from wf_settings where id;
 for r in select * from wf_limits where agent_id=aid and (client_id is null or client_id=cid) loop
 foreach kind in array array['day','week'] loop
 cap:=case when kind='day' then r.daily_minutes else r.weekly_minutes end;
 if cap is null then continue; end if;
 start_at:=wf_period(at_time,kind);
 end_at:=((start_at at time zone tz)+case when kind='day' then interval '1 day' else interval '7 days' end) at time zone tz;
 select coalesce(sum(extra_minutes),0),min(expires_at) into extra,override_end from wf_overrides where agent_id=aid
 and client_id is not distinct from r.client_id and period=kind and period_start=start_at and expires_at>at_time;
 cap:=(cap+extra)*60;
 used:=wf_usage(aid,r.client_id,start_at,at_time);
 left_seconds:=least(left_seconds,greatest(0,cap-used),extract(epoch from(end_at-at_time)));
 if override_end is not null then left_seconds:=least(left_seconds,extract(epoch from(override_end-at_time))); end if;
 percent:=greatest(percent,case when cap>0 then used/cap*100 else 100 end);
 details:=details||jsonb_build_array(jsonb_build_object('period',kind,'client_id',r.client_id,'used_seconds',used,'cap_seconds',cap,'period_start',start_at,'period_end',end_at));
 end loop; end loop;
 return jsonb_build_object('remaining_seconds',left_seconds,'percent',round(percent,2),'rules',details);
end; $$;
create or replace function public.wf_stop_expired(aid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s record;
begin
 perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
 for s in select x.id,g.authorized_until from wf_sessions x join wf_segments g on g.session_id=x.id where x.agent_id=aid and x.ended_at is null and g.ended_at is null and g.authorized_until<=now() for update of x,g loop
 update wf_segments set ended_at=s.authorized_until where session_id=s.id and ended_at is null;
 update wf_sessions set ended_at=s.authorized_until,status='stopped',stop_reason='hour_limit' where id=s.id;
 insert into wf_audit(entity,entity_id,action,reason) values('wf_sessions',s.id,'auto_stop','Authorized working period ended');
 end loop;
end; $$;
create or replace function public.wf_timer(action text,campaign uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid:=auth.uid(); s wf_sessions; c wf_campaigns; budget jsonb; cutoff timestamptz;
begin
 if wf_role()<>'agent' then raise exception 'Agent access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
 perform wf_stop_expired(aid);
 select * into s from wf_sessions where agent_id=aid and ended_at is null for update;
 if action='desktop_state' then
 update wf_sessions set tracker_seen_at=now() where id=s.id returning * into s;
 action:='state';
 elsif action='web_idle' then
 action:=case when s.tracker_seen_at>now()-interval '30 seconds' then 'state' else 'idle' end;
 end if;
 if action='start' and s.id is null then
 select * into c from wf_campaigns where id=campaign and active;
 if c.id is null or not wf_assigned(aid,c.client_id,c.id) then raise exception 'Campaign is not assigned' using errcode='42501'; end if;
 budget:=wf_budget(aid,c.client_id);
 if (budget->>'remaining_seconds')::numeric<=0 then raise exception 'Hour limit reached'; end if;
 insert into wf_sessions(agent_id,client_id,campaign_id) values(aid,c.client_id,c.id) returning * into s;
 insert into wf_segments(session_id,authorized_until) values(s.id,now()+make_interval(secs=>(budget->>'remaining_seconds')::double precision));
 elsif action='start' then
 if s.campaign_id is distinct from campaign then raise exception 'Clock out before changing campaigns'; end if;
 elsif action in ('pause','idle','stop') and s.id is not null then
 update wf_segments set ended_at=least(now(),authorized_until),idle_flag=(action='idle') where session_id=s.id and ended_at is null;
 update wf_sessions set status=case when action='stop' then 'stopped' else 'break' end,
 ended_at=case when action='stop' then now() else null end,stop_reason=action where id=s.id returning * into s;
 elsif action='resume' and s.id is not null and s.status='break' then
 if not wf_assigned(aid,s.client_id,s.campaign_id) then raise exception 'Assignment has ended' using errcode='42501'; end if;
 budget:=wf_budget(aid,s.client_id);
 if (budget->>'remaining_seconds')::numeric<=0 then raise exception 'Hour limit reached'; end if;
 insert into wf_segments(session_id,authorized_until) values(s.id,now()+make_interval(secs=>(budget->>'remaining_seconds')::double precision));
 update wf_sessions set status='working',stop_reason=null where id=s.id returning * into s;
 elsif action not in ('state','pause','idle','stop','resume') then raise exception 'Invalid timer action';
 end if;
 if s.id is not null and s.ended_at is null then
 -- Limit reductions and revoked assignments take effect on the next heartbeat.
 budget:=wf_budget(aid,s.client_id);
 if s.status='working' then
 cutoff:=now()+make_interval(secs=>(budget->>'remaining_seconds')::double precision);
 if not wf_assigned(aid,s.client_id,s.campaign_id) then cutoff:=now(); end if;
 update wf_segments set authorized_until=least(authorized_until,cutoff) where session_id=s.id and ended_at is null;
 perform wf_stop_expired(aid);
 select * into s from wf_sessions where id=s.id;
 end if;
 end if;
 if action<>'state' then insert into wf_audit(entity,entity_id,action) values('wf_sessions',s.id,action); end if;
 return jsonb_build_object('session',case when s.id is null then null else to_jsonb(s) end,
 'budget',coalesce(budget,case when campaign is not null then wf_budget(aid,(select client_id from wf_campaigns where id=campaign)) end),
 'authorized_until',(select authorized_until from wf_segments where session_id=s.id and ended_at is null),'server_time',now());
end; $$;
create or replace function public.wf_add_transfer(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c wf_campaigns; aid uuid; result_id uuid;
begin
 aid:=case when wf_role()='admin' then (payload->>'agent_id')::uuid else auth.uid() end;
 if wf_role() not in ('admin','agent') then raise exception 'Transfer creation is not permitted' using errcode='42501'; end if;
 if length(trim(coalesce(payload->>'lead_name','')))=0 or length(trim(coalesce(payload->>'state','')))=0 then raise exception 'Lead name and state are required for a manual transfer'; end if;
 select * into c from wf_campaigns where id=(payload->>'campaign_id')::uuid;
 if not wf_assigned(aid,c.client_id,c.id) then raise exception 'Campaign is not assigned' using errcode='42501'; end if;
 insert into wf_transfers(agent_id,client_id,campaign_id,lead_name,phone,state,qualifying_details,outcome,notes)
 values(aid,c.client_id,c.id,coalesce(payload->>'lead_name',''),payload->>'phone',coalesce(payload->>'state',''),
 coalesce(payload->'qualifying_details','{}'),payload->>'outcome',coalesce(payload->>'notes','')) returning id into result_id;
 insert into wf_audit(entity,entity_id,action) values('wf_transfers',result_id,'create');
 return result_id;
end; $$;
create or replace function public.wf_review_time(sid uuid,decision text,reason text,new_start timestamptz default null,new_end timestamptz default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s wf_sessions; before_row jsonb;
begin
 if wf_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if reason is null or length(trim(reason))<3 or decision not in ('pending','approved','rejected') then raise exception 'Decision and reason are required'; end if;
 select * into s from wf_sessions where id=sid;
 if s.id is null then raise exception 'Time entry not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s.agent_id::text,0));
 select * into s from wf_sessions where id=sid for update;
 if s.ended_at is null then raise exception 'Stop the session before reviewing it'; end if;
 before_row:=jsonb_build_object('session',to_jsonb(s),'segments',(select jsonb_agg(g) from wf_segments g where session_id=sid));
 if new_start is not null or new_end is not null then
 if new_start is null or new_end is null or new_end<=new_start or new_end>now() then raise exception 'Invalid edit range'; end if;
 if exists(select 1 from wf_sessions where agent_id=s.agent_id and id<>sid and started_at<new_end and coalesce(ended_at,now())>new_start) then raise exception 'Edited time overlaps another session'; end if;
 -- Explicit replacement edit: original break segments remain in immutable audit.
 delete from wf_segments where session_id=sid;
 insert into wf_segments(session_id,started_at,ended_at,authorized_until) values(sid,new_start,new_end,new_end);
 update wf_sessions set started_at=new_start,ended_at=new_end where id=sid;
 end if;
 update wf_sessions set review_status=decision where id=sid;
 insert into wf_audit(entity,entity_id,action,reason,before_value,after_value) values('wf_sessions',sid,'review',reason,before_row,
 jsonb_build_object('session',(select to_jsonb(x) from wf_sessions x where id=sid),'segments',(select jsonb_agg(g) from wf_segments g where session_id=sid)));
end; $$;
create or replace function public.wf_grant_override(aid uuid,cid uuid,kind text,minutes integer,reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid; start_at timestamptz; end_at timestamptz; tz text;
begin
 if wf_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if kind not in ('day','week') then raise exception 'Invalid override period'; end if;
 perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
 select cap_timezone into tz from wf_settings where id;
 start_at:=wf_period(now(),kind);
 end_at:=((start_at at time zone tz)+case when kind='day' then interval '1 day' else interval '7 days' end) at time zone tz;
 insert into wf_overrides(agent_id,client_id,period,period_start,extra_minutes,expires_at,reason)
 values(aid,cid,kind,start_at,minutes,end_at,reason) returning id into oid;
 insert into wf_audit(entity,entity_id,action,reason,after_value) values('wf_overrides',oid,'grant',reason,(select to_jsonb(o) from wf_overrides o where id=oid));
 return oid;
end; $$;
create or replace function public.wf_sweep_timers() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid; begin
 for aid in select distinct agent_id from wf_sessions where ended_at is null loop perform wf_stop_expired(aid); end loop;
end; $$;
-- Do not expose arbitrary users' cap/usage functions or the system sweep.
revoke all on function wf_period(timestamptz,text),wf_usage(uuid,uuid,timestamptz,timestamptz),wf_budget(uuid,uuid,timestamptz),wf_stop_expired(uuid),wf_sweep_timers(),wf_timer(text,uuid),wf_add_transfer(jsonb),wf_review_time(uuid,text,text,timestamptz,timestamptz),wf_grant_override(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function wf_timer(text,uuid),wf_add_transfer(jsonb),wf_review_time(uuid,text,text,timestamptz,timestamptz),wf_grant_override(uuid,uuid,text,integer,text) to authenticated;
grant execute on function wf_sweep_timers() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
 perform cron.schedule('workforce-hour-caps','* * * * *','select public.wf_sweep_timers()');
 end if;
end $$;
commit;
