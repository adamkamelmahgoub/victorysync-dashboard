import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PageLayout } from "../components/PageLayout";
import { MightyCallTransferSync } from '../components/MightyCallTransferSync';
import { fetchJson } from "../lib/apiClient";

type Row = Record<string, any>;
const base = "/api/workforce";
const action = async (name: string, body: Row) =>
  (
    await fetchJson(`${base}/actions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).result;
async function records(table: string) {
  const rows: Row[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await fetchJson(`${base}/data/${table}?offset=${offset}`);
    rows.push(...page.rows);
    offset = page.next_offset;
  }
  return rows;
}
function formValues(form: HTMLFormElement): Row {
  const result: Row = {};
  new FormData(form).forEach((v, k) => {
    result[k] = v;
  });
  return result;
}
const date = (value: string) => new Date(value).toLocaleString();
const fields: Record<string, string[]> = {
  campaigns: ["id", "client_id", "name", "active"],
  assignments: ["id", "agent_id", "client_id", "campaign_id", "active"],
  users: ["user_id", "role", "display_name"],
  client_members: ["client_id", "user_id"],
  clients: ["id", "name", "timezone", "screenshots_enabled"],
  limits: ["id", "agent_id", "client_id", "daily_minutes", "weekly_minutes"],
  transfers: [
    "id",
    "agent_id",
    "client_id",
    "campaign_id",
    "occurred_at",
    "lead_name",
    "phone",
    "state",
    "outcome",
    "notes",
  ],
  provider_routes: [
    "id",
    "agent_id",
    "client_id",
    "campaign_id",
    "extension",
    "business_number",
    "active",
  ],
  settings: [
    "id",
    "cap_timezone",
    "idle_minutes",
    "screenshot_min_minutes",
    "screenshot_max_minutes",
    "screenshots_enabled",
    "blur_screenshots",
    "window_titles_enabled",
    "retention_days",
  ],
};
const booleans = new Set([
  "active",
  "screenshots_enabled",
  "blur_screenshots",
  "window_titles_enabled",
]);
const numbers = new Set([
  "daily_minutes",
  "weekly_minutes",
  "idle_minutes",
  "screenshot_min_minutes",
  "screenshot_max_minutes",
  "retention_days",
]);
export default function WorkforcePage() {
  const [me, setMe] = useState<Row | null>(null),
    [data, setData] = useState<Record<string, Row[]>>({}),
    [tab, setTab] = useState("Overview");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const [timer, setTimer] = useState<Row | null>(null),
    [campaign, setCampaign] = useState(""),
    [now, setNow] = useState(Date.now());
  const [from, setFrom] = useState(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [group, setGroup] = useState("day"),
    [config, setConfig] = useState("campaigns"),
    [edit, setEdit] = useState<Row>({}),
    [shot, setShot] = useState("");
  const [clientFilter,setClientFilter]=useState('');
  const [agentFilter,setAgentFilter]=useState('');
  const [campaignFilter,setCampaignFilter]=useState('');
  const lastActivity = useRef(Date.now());
  const load = useCallback(async () => {
    const who = await fetchJson(`${base}/me`);
    setMe(who);
    const names = [
      "users",
      "clients",
      "campaigns",
      "assignments",
      "sessions",
      "segments",
      "transfers",
      "screenshots",
    ];
    if (who.role !== "client")
      names.push("settings", "limits", "activity", "consents");
    if (who.role === "admin")
      names.push(
        "audit",
        "client_members",
        "overrides",
        "provider_routes",
        "transfer_inbox",
      );
    const values = await Promise.all(names.map(records));
    setData(Object.fromEntries(names.map((name, i) => [name, values[i]])));
    if (who.role === "agent")
      setTimer(await action("timer", { action: "state" }));
  }, []);
  const run = async (fn: () => Promise<any>, message = "Saved") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (me?.role !== "agent") return;
    const active = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("pointermove", active);
    window.addEventListener("keydown", active);
    const id = setInterval(async () => {
      try {
        const idle =
          Date.now() - lastActivity.current >
          (data.settings?.[0]?.idle_minutes || 10) * 60000;
        const result = await action("timer", {
          action:
            idle && timer?.session?.status === "working" ? "web_idle" : "state",
          campaign: campaign || null,
        });
        setTimer(result);
      } catch (e: any) {
        setError(e.message);
      }
    }, 15000);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointermove", active);
      window.removeEventListener("keydown", active);
    };
  }, [me?.role, campaign, timer?.session?.status, data.settings]);
  const admin = me?.role === "admin";
  useEffect(() => {
    if (!me) return;
    let active = true;
    const refresh = async () => {
      try {
        const transfers = await records('transfers');
        const inbox = me.role === 'admin' ? await records('transfer_inbox') : null;
        if (active) setData(previous => ({ ...previous, transfers, ...(inbox ? { transfer_inbox: inbox } : {}) }));
      } catch (e: any) { if (active) setError(e.message); }
    };
    const interval = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [me?.role]);
  const label = (table: string, id: string) =>
    (data[table] || []).find((r) => (r.id || r.user_id) === id)?.[
      table === "users" ? "display_name" : "name"
    ] || id;
  const start = new Date(`${from}T00:00:00`).getTime(),
    end = new Date(`${to}T23:59:59.999`).getTime();
  const transfers = (data.transfers || []).filter(
    (r) =>
      (!clientFilter || r.client_id===clientFilter) && (!agentFilter || r.agent_id===agentFilter) && (!campaignFilter || r.campaign_id===campaignFilter) &&
      Date.parse(r.occurred_at) >= start && Date.parse(r.occurred_at) <= end,
  );
  const sessions = (data.sessions || []).filter(
    (r) =>
      (!clientFilter || r.client_id===clientFilter) && (!agentFilter || r.agent_id===agentFilter) && (!campaignFilter || r.campaign_id===campaignFilter) &&
      Date.parse(r.started_at) <= end &&
      Date.parse(r.ended_at || new Date(now).toISOString()) >= start,
  );
  const seconds = (sid: string) =>
    (data.segments || [])
      .filter((g) => g.session_id === sid)
      .reduce(
        (sum, g) =>
          sum +
          Math.max(
            0,
            (Math.min(
              Date.parse(g.ended_at || g.authorized_until),
              Date.parse(g.authorized_until),
              now,
              end,
            ) -
              Math.max(Date.parse(g.started_at), start)) /
              1000,
          ),
        0,
      );
  const hours = sessions.reduce((sum, r) => sum + seconds(r.id) / 3600, 0);
  const grouped = useMemo(() => {
    const result: Record<
      string,
      { transfers: number; connected: number; hours: number }
    > = {};
    const keyFor = (r: Row, at: number) => {
      if (["agent", "client", "campaign"].includes(group))
        return r[group + "_id"];
      const d = new Date(at);
      if (group === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        ...(group === "month" ? [] : [String(d.getDate()).padStart(2, "0")]),
      ].join("-");
    };
    const ensure = (key: string) =>
      result[key] || (result[key] = { transfers: 0, connected: 0, hours: 0 });
    for (const r of transfers) {
      const v = ensure(keyFor(r, Date.parse(r.occurred_at)));
      v.transfers++;
      if (r.outcome === "connected") v.connected++;
    }
    for (const session of sessions)
      for (const segment of (data.segments || []).filter(
        (g) => g.session_id === session.id,
      )) {
        let cursor = Math.max(start, Date.parse(segment.started_at));
        const stop = Math.min(
          end,
          now,
          Date.parse(segment.ended_at || segment.authorized_until),
          Date.parse(segment.authorized_until),
        );
        while (cursor < stop) {
          const midnight = new Date(cursor);
          midnight.setHours(24, 0, 0, 0);
          const until = Math.min(stop, midnight.getTime());
          ensure(keyFor(session, cursor)).hours += (until - cursor) / 3600000;
          cursor = until;
        }
      }
    return result;
  }, [data, group, from, to, clientFilter, agentFilter, campaignFilter, Math.floor(now / 60000)]);
  const clock = async (kind: string) => {
    setTimer(
      await action("timer", { action: kind, campaign: campaign || null }),
    );
    lastActivity.current = Date.now();
  };
  const exportCsv = () => {
    const escape = (v: any) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'")
        .replace(/"/g, '""') +
      '"';
    const rows = [
      [
        "Agent",
        "Client",
        "Campaign",
        "Start UTC",
        "End UTC",
        "Hours",
        "Review",
      ],
      ...sessions.map((r) => [
        label("users", r.agent_id),
        label("clients", r.client_id),
        label("campaigns", r.campaign_id),
        r.started_at,
        r.ended_at,
        (seconds(r.id) / 3600).toFixed(2),
        r.review_status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((r) => r.map(escape).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "victory-sync-timesheet.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const options = (table: string) =>
    (data[table] || []).map((r) => (
      <option key={r.id || r.user_id} value={r.id || r.user_id}>
        {r.name || r.display_name || r.id}
      </option>
    ));
  const chooseCampaign = (
    <label>
      Campaign
      <select
        required
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
      >
        <option value="">Choose campaign</option>
        {options("campaigns")}
      </select>
    </label>
  );
  const tabNames = [
    "Overview",
    ...(me?.role === "agent" ? ["Timer"] : []),
    "Transfers",
    "Timesheets",
    ...(me?.role !== "client" || data.screenshots?.length
      ? ["Monitoring"]
      : []),
    ...(admin ? ["Administration", "Audit"] : []),
  ];
  return (
    <PageLayout
      title="Workforce"
      description="Campaign transfers, working hours and activity"
      eyebrow="Victory Sync"
    >
      <div className="wf-workspace">
        {error && (
          <div role="alert" className="wf-error">
            <div><strong>Unable to load your workspace</strong><p>{error}</p></div>
            <button onClick={() => run(load, "Refreshed")}>Retry</button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {loading ? (
          <p role="status">Loading your workspace...</p>
        ) : !me ? (
          <p>Workforce access is unavailable.</p>
        ) : (
          <>
            <nav
              aria-label="Workforce sections"
              className="wf-tabs"
            >
              {tabNames.map((name) => (
                <button
                  key={name}
                  aria-current={tab === name ? "page" : undefined}
                  className="wf-tab"
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {!["Timer", "Administration", "Audit", "Review"].includes(tab) && <section className="wf-filters" aria-label="Report filters">
            <div className="wf-filter-heading"><h2>Report filters</h2><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
            <div className="wf-form wf-filter-fields">
              <label>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Through
                <input
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label>Client<select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="">All clients</option>{options('clients')}</select></label>
              <label>Agent<select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}><option value="">All agents</option>{(data.users || []).filter(r=>r.role==='agent').map(r=><option key={r.user_id} value={r.user_id}>{r.display_name}</option>)}</select></label>
              <label>Campaign<select value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)}><option value="">All campaigns</option>{options('campaigns')}</select></label>
            </div>
            </section>}
            {tab === "Overview" && (
              <>
                <div className="wf-grid wf-metrics">
                  {[
                    ["Transfers", transfers.length],
                    [
                      "Connect rate",
                      `${transfers.length ? ((transfers.filter((r) => r.outcome === "connected").length / transfers.length) * 100).toFixed(1) : "0"}%`,
                    ],
                    ["Hours worked", hours.toFixed(2)],
                    [
                      "Transfers per hour",
                      hours
                        ? (transfers.length / hours).toFixed(2)
                        : "No hours recorded",
                    ],
                  ].map(([name, value]) => (
                    <section className="wf-metric" key={name}>
                      <h2>{name}</h2>
                      <strong className={typeof value === 'string' && value.length > 12 ? 'wf-metric-empty' : 'text-2xl'}>{value}</strong>
                    </section>
                  ))}
                </div>
                <section className="wf-report">
                <div className="wf-report-heading"><div><h2>Transfer performance</h2><p>Connections and hours across your selected period.</p></div>
                <label>
                  Group transfers by
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    {[
                      "day",
                      "week",
                      "month",
                      "agent",
                      "client",
                      "campaign",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                </div>
                <Table
                  headers={[
                    "Group",
                    "Transfers",
                    "Connected",
                    "Connect rate",
                    "Hours",
                    "Transfers per hour",
                  ]}
                  rows={Object.entries(grouped)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, v]) => [
                      ["agent", "client", "campaign"].includes(group)
                        ? label(group === "agent" ? "users" : group + "s", key)
                        : key,
                      v.transfers,
                      v.connected,
                      `${v.transfers ? ((v.connected / v.transfers) * 100).toFixed(1) : "0"}%`,
                      v.hours.toFixed(2),
                      v.hours
                        ? (v.transfers / v.hours).toFixed(2)
                        : "No hours recorded",
                    ])}
                />
                </section>
              </>
            )}
            {tab === "Timer" && (
              <section className="vs-surface p-5">
                <h2>Your timer</h2>
                {chooseCampaign}
                <p role="status">
                  {timer?.session?.status || "Clocked out"}
                  {timer?.session?.campaign_id
                    ? ` - ${label("campaigns", timer.session.campaign_id)}`
                    : ""}
                </p>
                <p>
                  Authorized work remaining:{" "}
                  {timer?.authorized_until
                    ? Math.max(
                        0,
                        Math.ceil(
                          (Date.parse(timer.authorized_until) - now) / 60,
                        ),
                      )
                    : "0"}{" "}
                  minutes
                </p>
                {Number(timer?.budget?.percent) >= 80 && (
                  <p role="alert">
                    {Number(timer?.budget?.percent) >= 100
                      ? "Hour limit reached. An administrator must grant an override to continue."
                      : Number(timer?.budget?.percent) >= 95
                        ? "95% of your hour allowance has been used."
                        : "80% of your hour allowance has been used."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!timer?.session || timer.session.status === "stopped" ? (
                    <button
                      disabled={busy || !campaign}
                      onClick={() => run(() => clock("start"), "Clocked in")}
                    >
                      Clock in
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              clock(
                                timer.session.status === "break"
                                  ? "resume"
                                  : "pause",
                              ),
                            "Timer updated",
                          )
                        }
                      >
                        {timer.session.status === "break"
                          ? "Resume"
                          : "Take a break"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => run(() => clock("stop"), "Clocked out")}
                      >
                        Clock out
                      </button>
                    </>
                  )}
                </div>
                <p>
                  Browser idle detection uses activity on this page. System
                  activity requires the desktop tracker.
                </p>
                <Table
                  headers={["Period", "Used minutes", "Cap minutes"]}
                  rows={(timer?.budget?.rules || []).map((r: Row) => [
                    r.period,
                    (r.used_seconds / 60).toFixed(1),
                    (r.cap_seconds / 60).toFixed(1),
                  ])}
                />
              </section>
            )}
            {tab === "Transfers" && (
              <>
                {admin && <MightyCallTransferSync clients={data.clients || []} routeCount={(data.provider_routes || []).filter(r => r.active).length} assignmentCount={(data.assignments || []).filter(r => r.active).length} />}
                {me.role !== "client" && (
                  <form
                    className="vs-surface p-5 wf-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const v = formValues(form);
                      run(async () => {
                        await action("transfer", {
                          payload: {
                            ...v,
                            campaign_id: campaign,
                            qualifying_details: {
                              details: v.details,
                              debt_amount: v.debt_amount || null,
                            },
                          },
                        });
                        form.reset();
                      }, "Transfer logged");
                    }}
                  >
                    {chooseCampaign}
                    {admin && (
                      <label>
                        Agent
                        <select name="agent_id" required>
                          <option value="">Choose agent</option>
                          {(data.users || [])
                            .filter((r) => r.role === "agent")
                            .map((r) => (
                              <option key={r.user_id} value={r.user_id}>
                                {r.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {[
                      "lead_name",
                      "phone",
                      "state",
                      "debt_amount",
                      "details",
                      "notes",
                    ].map((name) => (
                      <label key={name}>
                        {name.replace(/_/g, " ")}
                        <input
                          name={name}
                          required={["phone","lead_name","state"].includes(name)}
                          maxLength={name === "notes" ? 4000 : 200}
                          type={
                            name === "debt_amount"
                              ? "number"
                              : name === "phone"
                                ? "tel"
                                : "text"
                          }
                          min="0"
                        />
                      </label>
                    ))}
                    <label>
                      Outcome
                      <select name="outcome">
                        {[
                          "connected",
                          "no_answer",
                          "callback_requested",
                          "disqualified",
                        ].map((v) => (
                          <option value={v} key={v}>
                            {v.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy || !campaign}>Log transfer</button>
                  </form>
                )}
                <Table
                  headers={[
                    "When",
                    "Agent",
                    "Client",
                    "Campaign",
                    "Lead",
                    "Phone",
                    "State",
                    "Outcome",
                    "Qualifying details",
                    "Notes",
                  ]}
                  rows={transfers.map((r) => [
                    date(r.occurred_at),
                    label("users", r.agent_id),
                    label("clients", r.client_id),
                    label("campaigns", r.campaign_id),
                    r.lead_name,
                    r.phone,
                    r.state,
                    r.outcome?.replace(/_/g, " ") || "Unconfirmed",
                    JSON.stringify(r.qualifying_details),
                    r.notes,
                  ])}
                />
              </>
            )}
            {tab === "Timesheets" && (
              <>
                {admin && (
                  <div className="flex gap-2 print:hidden">
                    <button onClick={exportCsv}>Export CSV</button>
                    <button onClick={() => window.print()}>
                      Print / save PDF
                    </button>
                  </div>
                )}
                <Table
                  headers={[
                    "Agent",
                    "Client",
                    "Campaign",
                    "Started",
                    "Ended",
                    "Hours",
                    "Status",
                    "Activity",
                    "Review",
                  ]}
                  rows={sessions.map((r) => {
                    const a = (data.activity || []).filter(
                      (a) => a.session_id === r.id,
                    );
                    return [
                      label("users", r.agent_id),
                      label("clients", r.client_id),
                      label("campaigns", r.campaign_id),
                      date(r.started_at),
                      r.ended_at ? date(r.ended_at) : r.status,
                      (seconds(r.id) / 3600).toFixed(2),
                      r.review_status,
                      a.length
                        ? `${((a.filter((a) => a.key_count + a.click_count + a.movement_count > 0).length / a.length) * 100).toFixed(0)}% of sampled minutes`
                        : "No activity samples",
                      admin && r.ended_at ? (
                        <button
                          onClick={() => {
                            setEdit({ sid: r.id, decision: r.review_status });
                            setTab("Review");
                          }}
                        >
                          Review / edit
                        </button>
                      ) : admin ? <button onClick={() => {
                        const reason = window.prompt('Reason for stopping this session');
                        if (reason?.trim()) run(() => action('admin_stop', {aid:r.agent_id,reason}), 'Session stopped');
                      }}>Stop session</button> : null,
                    ];
                  })}
                />
              </>
            )}
            {tab === "Review" && admin && (
              <form
                className="wf-form vs-surface p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = formValues(e.currentTarget);
                  run(
                    () =>
                      action("review", {
                        sid: edit.sid,
                        decision: v.decision,
                        reason: v.reason,
                        new_start: v.new_start
                          ? new Date(String(v.new_start)).toISOString()
                          : null,
                        new_end: v.new_end
                          ? new Date(String(v.new_end)).toISOString()
                          : null,
                      }),
                    "Review saved",
                  );
                }}
              >
                <label>
                  Decision
                  <select name="decision" defaultValue={edit.decision}>
                    {["pending", "approved", "rejected"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason
                  <input name="reason" required minLength={3} />
                </label>
                <label>
                  Replacement start
                  <input type="datetime-local" name="new_start" />
                </label>
                <label>
                  Replacement end
                  <input type="datetime-local" name="new_end" />
                </label>
                <p>
                  Optional replacement start and end replace the working
                  segments. Original segments remain in the audit log.
                </p>
                <button disabled={busy}>Save review</button>
              </form>
            )}
            {tab === "Monitoring" && (
              <>
                {me.role !== 'client' && <Table headers={['Minute','Session','Keystroke count','Click count','Movement count','Application','Window title']} rows={(data.activity || []).map(r => [date(r.minute_at),r.session_id,r.key_count,r.click_count,r.movement_count,r.app_name || 'Not collected',r.window_title || 'Not collected'])} />}
                <p>
                  Only authorized working periods are monitored. Screenshots
                  open through links that expire after 60 seconds.
                </p>
                <Table
                  headers={["Captured", "Blurred", "Expires", "Image", ...(admin ? ['Delete'] : [])]}
                  rows={(data.screenshots || []).map((r) => [
                    date(r.captured_at),
                    r.blurred ? "Yes" : "No",
                    date(r.expires_at),
                    <button
                      onClick={() =>
                        run(
                          async () =>
                            setShot(
                              (
                                await fetchJson(
                                  `${base}/screenshots/${r.id}/url`,
                                )
                              ).url,
                            ),
                          "Screenshot opened",
                        )
                      }
                    >
                      View screenshot
                    </button>,
                    ...(admin ? [<button onClick={() => {
                      if(window.confirm('Delete this screenshot permanently?')) run(()=>fetchJson(`${base}/screenshots/${r.id}`,{method:'DELETE'}),'Screenshot deleted');
                    }}>Delete screenshot</button>] : []),
                  ])}
                />
                {shot && (
                  <div>
                    <button onClick={() => setShot("")}>Close image</button>
                    <img
                      src={shot}
                      alt="Work session screenshot"
                      className="max-w-full"
                    />
                  </div>
                )}
              </>
            )}
            {tab === "Administration" && admin && (
              <>
                <label>
                  Manage
                  <select
                    value={config}
                    onChange={(e) => {
                      setConfig(e.target.value);
                      setEdit(e.target.value === "settings" ? data.settings?.[0] || {} : {});
                    }}
                  >
                    {Object.keys(fields).map((v) => (
                      <option key={v} value={v}>
                        {v.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <form
                  className="wf-form vs-surface p-5"
                  key={config + JSON.stringify(edit)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const values: Row = formValues(e.currentTarget);
                    for (const k of Object.keys(values)) {
                      if (booleans.has(k)) values[k] = values[k] === "true";
                      else if (numbers.has(k))
                        values[k] = values[k] === "" ? null : Number(values[k]);
                      else if (values[k] === "") {
                        if (k === "id") delete values[k];
                        else if (k === 'client_id' && config === 'limits') values[k] = null;
                        else if (k === 'occurred_at') delete values[k];
                      }
                    }
                    if (config === "settings") values.id = true;
                    run(
                      () =>
                        fetchJson(`${base}/data/${config}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...edit, ...values }),
                        }),
                      "Configuration saved",
                    );
                  }}
                >
                  {fields[config]
                    .filter((k) => k !== 'id')
                    .map((k) => (
                      <label key={k}>
                        {({agent_id:'Agent',client_id:'Client',campaign_id:'Campaign',user_id:'User',daily_minutes:'Daily cap (minutes)',weekly_minutes:'Weekly cap (minutes)',extension:'MightyCall extension',business_number:'Business number (digits only)'} as Record<string,string>)[k] || k.replace(/_/g, ' ')}
                        {booleans.has(k) ? (
                          <select
                            name={k}
                            defaultValue={String(
                              edit[k] ??
                                (k === "active" || k === "blur_screenshots"),
                            )}
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        ) : k === "role" ? (
                          <select name={k} defaultValue={edit[k] || "agent"}>
                            {["agent", "client", "admin"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : [
                            "agent_id",
                            "user_id",
                            "client_id",
                            "campaign_id",
                          ].includes(k) ? (
                          <select name={k} defaultValue={edit[k] || ""}>
                            <option value="">
                              {k === "client_id" && config === "limits"
                                ? "All clients"
                                : "Choose"}
                            </option>
                            {options(
                              k === "client_id"
                                ? "clients"
                                : k === "campaign_id"
                                  ? "campaigns"
                                  : "users",
                            )}
                          </select>
                        ) : (
                          <input
                            name={k}
                            type={numbers.has(k) ? "number" : "text"}
                            defaultValue={edit[k] ?? ""}
                            readOnly={k === "id" && !!edit.id}
                          />
                        )}
                      </label>
                    ))}
                  <button disabled={busy}>
                    Save {config.replace(/_/g, " ")}
                  </button>
                </form>
                <Table
                  headers={[...fields[config], "Edit"]}
                  rows={(data[config] || []).map((r) => [
                    ...fields[config].map((k) => String(r[k] ?? "")),
                    <button onClick={() => setEdit(r)}>Edit</button>,
                  ])}
                />
                <h2>Grant an hour override</h2>
                <form
                  className="wf-form vs-surface p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = formValues(e.currentTarget);
                    run(
                      () =>
                        action("override", {
                          aid: v.aid,
                          cid: v.cid || null,
                          kind: v.kind,
                          minutes: Number(v.minutes),
                          reason: v.reason,
                        }),
                      "Override granted",
                    );
                  }}
                >
                  <label>
                    Agent
                    <select name="aid" required>
                      {options("users")}
                    </select>
                  </label>
                  <label>
                    Client
                    <select name="cid">
                      <option value="">All clients</option>
                      {options("clients")}
                    </select>
                  </label>
                  <label>
                    Period
                    <select name="kind">
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                    </select>
                  </label>
                  <label>
                    Extra minutes
                    <input name="minutes" type="number" min="1" required />
                  </label>
                  <label>
                    Reason
                    <input name="reason" required minLength={3} />
                  </label>
                  <button disabled={busy}>Grant override</button>
                </form>
              </>
            )}
            {tab === "Audit" && admin && (
              <>
                <h2>Provider events awaiting review</h2>
                <Table
                  headers={["Received", "Reason", "Event", "Resolved"]}
                  rows={(data.transfer_inbox || []).map((r) => [
                    date(r.received_at),
                    r.reason,
                    JSON.stringify(r.payload),
                    r.resolved ? "Yes" : "No",
                  ])}
                />
                <h2>Change history</h2>
                <Table
                  headers={[
                    "When",
                    "Who",
                    "Entity",
                    "Action",
                    "Reason",
                    "Before",
                    "After",
                  ]}
                  rows={(data.audit || []).map((r) => [
                    date(r.occurred_at),
                    label("users", r.actor_id),
                    r.entity,
                    r.action,
                    r.reason,
                    JSON.stringify(r.before_value),
                    JSON.stringify(r.after_value),
                  ])}
                />
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div
      className="wf-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={headers.join(", ")}
    >
      <table className="wf-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>No records for this selection.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
