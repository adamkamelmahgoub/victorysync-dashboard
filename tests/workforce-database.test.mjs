import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Entirely in-memory PostgreSQL. Never reads credentials or connects to Supabase.
test("workforce migrations, RLS isolation, role escalation and timer limits", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const ids = {
    admin: "10000000-0000-4000-8000-000000000001",
    agent: "10000000-0000-4000-8000-000000000002",
    client: "10000000-0000-4000-8000-000000000003",
    other: "10000000-0000-4000-8000-000000000004",
    client2: "10000000-0000-4000-8000-000000000005",
    org: "20000000-0000-4000-8000-000000000001",
    org2: "20000000-0000-4000-8000-000000000002",
    campaign: "30000000-0000-4000-8000-000000000001",
    campaign2: "30000000-0000-4000-8000-000000000002",
  };
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to authenticated,anon,service_role;
    create table profiles(id uuid primary key,global_role text,full_name text,email text,is_global_admin boolean default false,can_upload_leads boolean default false,updated_at timestamptz);
    create table organizations(id uuid primary key,name text,timezone text,sla_target_percent numeric,sla_target_seconds integer,business_hours jsonb,escalation_email text);
    create table org_users(id uuid primary key default gen_random_uuid(),org_id uuid,user_id uuid,role text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated;
    create function public.get_complete_schema() returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
    grant execute on function public.get_complete_schema() to anon,authenticated;`);
  const inventory = JSON.parse(
    readFileSync(new URL("../audit/database-inventory.json", import.meta.url)),
  ).tables;
  for (const t of inventory) {
    if (["profiles", "organizations", "org_users", "admin_client_leads", "admin_client_lead_activities"].includes(t.name)) continue;
    await db.exec(
      `create table public."${t.name}"(id uuid primary key default gen_random_uuid()); grant all on public."${t.name}" to authenticated; insert into public."${t.name}" default values; alter table public."${t.name}" enable row level security; create policy historical_open on public."${t.name}" for all to authenticated using(true) with check(true);`,
    );
  }
  await db.exec(`grant all on profiles,organizations,org_users to authenticated;
    insert into profiles(id,global_role,full_name) values ('${ids.admin}','platform_admin','Admin'),('${ids.agent}',null,'Agent A'),('${ids.client}',null,'Client A'),('${ids.other}',null,'Agent B'),('${ids.client2}',null,'Client B');
    insert into organizations(id,name) values('${ids.org}','Client A'),('${ids.org2}','Client B');
    insert into org_users(org_id,user_id,role) values('${ids.org}','${ids.agent}','agent'),('${ids.org2}','${ids.other}','agent'),('${ids.org}','${ids.client}','org_admin'),('${ids.org2}','${ids.client2}','org_admin');`);
  await db.exec(`create view legacy_profile_view as select * from profiles;
    create materialized view legacy_profile_snapshot as select * from profiles;
    grant select on legacy_profile_view,legacy_profile_snapshot to public;`);
  for (const name of [
    "045_admin_client_leads.sql",
    "050_workforce_access.sql",
    "051_workforce_time_transfers.sql",
    "052_workforce_monitoring.sql",
    "053_workforce_operations.sql",
    "054_atomic_organization_settings.sql",
  ]) {
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.exec(`grant all on admin_client_leads,admin_client_lead_activities to authenticated;
    insert into admin_client_leads(organization_id,phone) values('${ids.org}','+12125550100');
    insert into admin_client_lead_activities(lead_id,organization_id,activity_type,summary)
    select id,organization_id,'created','Fixture lead' from admin_client_leads;`);
  const actor = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const denied = async (sql) => {
    await assert.rejects(db.exec(sql));
  };
  await actor(ids.admin);
  await db.exec(`insert into wf_campaigns(id,client_id,name) values('${ids.campaign}','${ids.org}','Debt'),('${ids.campaign2}','${ids.org2}','Other');
    insert into wf_assignments(agent_id,client_id,campaign_id) values('${ids.agent}','${ids.org}','${ids.campaign}'),('${ids.other}','${ids.org2}','${ids.campaign2}');
    insert into wf_limits(agent_id,daily_minutes,weekly_minutes) values('${ids.agent}',1,5);`);
  await db.exec(`update wf_settings set idle_minutes=12 where id=true`);
  for (const table of inventory)
    assert.ok(
      (await db.query(`select * from public."${table.name}"`)).rows.length,
      `${table.name}: administrator can read seeded records`,
    );
  await db.query('select wf_update_org_settings($1,$2)',[ids.org,JSON.stringify({name:'Client A',timezone:'America/New_York',sla_target_percent:90,sla_target_seconds:30,business_hours:{}})]);
  await actor(ids.agent);
  await denied(`select wf_update_org_settings('${ids.org}','{}')`);
  const start = (
    await db.query("select wf_timer($1,$2) as result", ["start", ids.campaign])
  ).rows[0].result;
  assert.equal(start.session.agent_id, ids.agent);
  assert.equal(Number(start.budget.remaining_seconds), 60);
  const sid = start.session.id;
  await db.exec("select wf_timer('desktop_state')");
  assert.equal((await db.query("select wf_timer('web_idle') as result")).rows[0].result.session.status,'working','an idle browser tab cannot pause an active desktop tracker');
  assert.equal(
    (
      await db.query("select wf_timer($1,$2) as result", [
        "start",
        ids.campaign,
      ])
    ).rows[0].result.session.id,
    sid,
    "duplicate clock-in is idempotent",
  );
  await denied(`select wf_timer('start','${ids.campaign2}')`);
  assert.equal(
    (
      await db.query(
        `update profiles set global_role='platform_admin' where id='${ids.agent}' returning id`,
      )
    ).rows.length,
    0,
  );
  await denied(
    `insert into wf_overrides(agent_id,period,period_start,extra_minutes,expires_at,reason) values('${ids.agent}','day',now(),999,now()+interval '1 day','bypass')`,
  );
  await denied(`select wf_add_transfer('{}'::jsonb)`);
  const payload = {
    campaign_id: ids.campaign,
    lead_name: "Test",
    phone: "+12125550100",
    state: "NY",
    outcome: "connected",
  };
  await db.query("select wf_add_transfer($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  await assert.rejects(
    db.query("select wf_add_transfer($1::jsonb)", [
      JSON.stringify({ ...payload, campaign_id: ids.campaign2 }),
    ]),
  );
  await denied(`select wf_prepare_screenshot('${sid}')`);
  await db.exec("select wf_accept_monitoring('2026-09-29-v1')");
  await actor(ids.client);
  assert.equal((await db.query("select * from wf_transfers")).rows.length, 1);
  assert.equal((await db.query("select * from wf_sessions")).rows.length, 1);
  assert.equal((await db.query("select * from wf_campaigns")).rows.length, 1);
  assert.equal((await db.query("select * from wf_limits")).rows.length, 0);
  assert.equal((await db.query("select * from wf_activity")).rows.length, 0);
  await denied(`select wf_timer('start','${ids.campaign}')`);
  await denied(`select wf_add_transfer('${JSON.stringify(payload)}')`);
  await denied(
    `insert into wf_campaigns(client_id,name) values('${ids.org}','Unauthorized')`,
  );
  assert.equal(
    (await db.query("update wf_campaigns set name='Unauthorized' returning id"))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("delete from wf_campaigns returning id")).rows.length,
    0,
  );
  await denied("select get_complete_schema()");
  await denied('select * from legacy_profile_view');
  await denied('select * from legacy_profile_snapshot');
  // All legacy tables are admin-only, even if historical grants permit mutation.
  for (const t of inventory) {
    assert.equal(
      (await db.query(`select * from public."${t.name}"`)).rows.length,
      0,
      `${t.name}: client read denied`,
    );
    assert.equal(
      (await db.query(`delete from public."${t.name}" returning id`)).rows
        .length,
      0,
      `${t.name}: client delete denied`,
    );
    assert.equal(
      (await db.query(`update public."${t.name}" set id=id returning id`)).rows
        .length,
      0,
      `${t.name}: client update denied`,
    );
    await denied(
      `insert into public."${t.name}"(id) values(gen_random_uuid())`,
    );
  }
  await actor(ids.client2);
  assert.equal((await db.query('select * from admin_client_leads')).rows.length,0,'upstream private leads stay hidden from clients');
  assert.equal((await db.query("update admin_client_leads set status='changed' returning id")).rows.length,0,'clients cannot modify upstream private leads');
  assert.equal((await db.query("select * from wf_transfers")).rows.length, 0);
  assert.equal((await db.query("select * from wf_sessions")).rows.length, 0);
  await actor(ids.other);
  assert.equal((await db.query("select * from wf_sessions")).rows.length, 0);
  // Advance the test fixture by moving authorized work into the past, without a real clock wait.
  await db.exec("reset role");
  await db.exec(`update wf_sessions set started_at=now()-interval '61 seconds' where id='${sid}';
    update wf_segments set started_at=now()-interval '61 seconds',authorized_until=now()-interval '1 second' where session_id='${sid}';`);
  await actor(ids.agent);
  await db.exec("select wf_timer('state')");
  assert.equal(
    (await db.query("select status from wf_sessions")).rows[0].status,
    "stopped",
  );
  await denied(`select wf_timer('start','${ids.campaign}')`);
  await actor(ids.admin);
  await db.exec(
    `select wf_grant_override('${ids.agent}',null,'day',1,'Approved extra minute')`,
  );
  await actor(ids.agent);
  assert.ok(
    (
      await db.query("select wf_timer($1,$2) as result", [
        "start",
        ids.campaign,
      ])
    ).rows[0].result.session.id,
  );
  await db.exec("select wf_timer('pause')");
  const pause = (await db.query("select wf_timer('state') as result")).rows[0]
    .result;
  assert.equal(pause.session.status, "break");
  await denied(`select wf_prepare_screenshot('${pause.session.id}')`);
  await db.exec("select wf_timer('stop')");
  await actor(ids.admin);
  await db.exec(
    `select wf_review_time('${sid}','approved','Verified timesheet')`,
  );
  assert.ok(
    (await db.query("select * from wf_audit where action='review'")).rows
      .length,
  );
  await denied("delete from wf_audit");
  // Seed private captures and an old broad Storage policy to prove the boundary.
  await db.exec("reset role");
  await db.exec(`insert into wf_screenshots(session_id,object_path,expires_at,blurred) values('${sid}','private-shot.jpg',now()+interval '1 day',true);
    insert into storage.objects(bucket_id,name) values('workforce-screenshots','private-shot.jpg');
    create policy historical_storage_open on storage.objects for all to authenticated using(true) with check(true);`);
  assert.equal(
    new Date(
      (
        await db.query(
          "select wf_period('2026-07-20T00:30:00Z','day') as start",
        )
      ).rows[0].start,
    ).toISOString(),
    "2026-07-19T21:00:00.000Z",
  );
  assert.equal(
    new Date(
      (
        await db.query(
          "select wf_period('2026-01-20T00:30:00Z','day') as start",
        )
      ).rows[0].start,
    ).toISOString(),
    "2026-01-19T22:00:00.000Z",
  );
  await actor(ids.client);
  assert.equal(
    (await db.query("select * from wf_screenshots")).rows.length,
    0,
    "screenshots are private by default",
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
    "historical storage policy cannot expose screenshots",
  );
  await denied(
    `select wf_record_activity('${sid}',date_trunc('minute',now()),1,1,1)`,
  );
  await denied(`select wf_ingest_transfer('{}'::jsonb)`);
  await actor(ids.admin);
  await db.exec(
    `update wf_clients set screenshots_enabled=true where id='${ids.org}'`,
  );
  await actor(ids.client);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
    "client sees only explicitly enabled campaign screenshots",
  );
  assert.equal(
    (await db.query("delete from storage.objects returning id")).rows.length,
    0,
    "client cannot delete a screenshot",
  );
  assert.equal(
    (await db.query("update storage.objects set name='tampered' returning id"))
      .rows.length,
    0,
    "client cannot replace a screenshot",
  );
  await actor(ids.client2);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
    "other client cannot read enabled screenshots",
  );
  await actor(ids.agent);
  assert.equal(
    (await db.query("select * from wf_screenshots")).rows.length,
    1,
    "agent can view own screenshots",
  );
  await actor(ids.other);
  assert.equal(
    (await db.query("select * from wf_screenshots")).rows.length,
    0,
    "agent cannot view a colleague screenshot",
  );
  await actor(ids.admin);
  await db.exec(`insert into wf_provider_routes(agent_id,client_id,campaign_id,extension,business_number) values('${ids.agent}','${ids.org}','${ids.campaign}','101','12125550000')`);
  await db.exec('reset role; set role service_role');
  const event={client_id:ids.org,source_key:'provider-transfer-1',extension:'101',business_number:'+1 (212) 555-0000',phone:'+12125550100',occurred_at:new Date().toISOString(),outcome:'connected'};
  const ingested=await db.query('select wf_ingest_transfer($1::jsonb) as id',[JSON.stringify(event)]);
  assert.ok(ingested.rows[0].id);
  const repeated=await db.query('select wf_ingest_transfer($1::jsonb) as id',[JSON.stringify(event)]);
  assert.equal(repeated.rows[0].id,ingested.rows[0].id,'provider replays are idempotent');
  const ambiguous=await db.query('select wf_ingest_transfer($1::jsonb) as id',[JSON.stringify({...event,source_key:'missing-timestamp',occurred_at:null})]);
  assert.equal(ambiguous.rows[0].id,null,'missing transfer times are not fabricated');
  assert.equal((await db.query("select * from wf_transfer_inbox where source_key='missing-timestamp'")).rows.length,1);
  await actor(ids.client2);
  assert.equal((await db.query('select * from wf_transfer_inbox')).rows.length,0);
  assert.equal((await db.query('select * from wf_provider_routes')).rows.length,0);
  assert.equal((await db.query("select * from wf_transfers where source_key='provider-transfer-1'")).rows.length,0);
  await actor(ids.admin);
  await db.exec(`update wf_users set role='admin' where user_id='${ids.agent}'`);
  assert.equal((await db.query(`select global_role from profiles where id='${ids.agent}'`)).rows[0].global_role,'platform_admin','staff promotion also enables existing admin tools');
  await actor(ids.agent);
  assert.equal((await db.query('select wf_role() as role')).rows[0].role,'admin');
  await actor(ids.admin);
  await db.exec(`update wf_users set role='agent' where user_id='${ids.agent}'`);
  assert.equal((await db.query(`select global_role from profiles where id='${ids.agent}'`)).rows[0].global_role,null,'demotion removes legacy administrator access');
  await actor(ids.agent);
  assert.equal((await db.query('select wf_role() as role')).rows[0].role,'agent');
  await db.exec("reset role; set role anon");
  await denied("select * from wf_sessions");
  await denied("select get_complete_schema()");
});
