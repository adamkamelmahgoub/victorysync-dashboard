-- Helper RPC for avg wait seconds today
create or replace function public.get_avg_wait_seconds_today(org_id uuid)
returns table (avg_wait_seconds_today numeric) as $$
begin
  return query
    select coalesce(avg(extract(epoch from (answered_at - started_at))), 0) as avg_wait_seconds_today
    from public.calls
    where date = current_date
      and status = 'Answered'
      and (org_id = org_id or org_id is null);
end;
$$ language plpgsql stable;
