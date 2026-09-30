begin;
create function public.wf_update_org_settings(organization_id uuid,settings jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare before_row jsonb; after_row jsonb;
begin
 if wf_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if coalesce(length(trim(settings->>'name')),0)=0 then raise exception 'Organization name is required'; end if;
 if not exists(select 1 from pg_timezone_names where name=settings->>'timezone') then raise exception 'Unknown timezone'; end if;
 if (settings->>'sla_target_percent')::numeric not between 0 and 100 or (settings->>'sla_target_seconds')::numeric<0 then raise exception 'Invalid service targets'; end if;
 select to_jsonb(o) into before_row from organizations o where id=organization_id for update;
 if before_row is null then raise exception 'Organization not found'; end if;
 update organizations set name=settings->>'name',timezone=settings->>'timezone',
 sla_target_percent=(settings->>'sla_target_percent')::numeric,sla_target_seconds=(settings->>'sla_target_seconds')::integer,
 business_hours=settings->'business_hours',escalation_email=nullif(settings->>'escalation_email','') where id=organization_id;
 select to_jsonb(o) into after_row from organizations o where id=organization_id;
 insert into wf_audit(entity,entity_id,action,before_value,after_value) values('organizations',organization_id,'update_settings',before_row,after_row);
end; $$;
revoke all on function wf_update_org_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function wf_update_org_settings(uuid,jsonb) to authenticated;
commit;
