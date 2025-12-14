import React, { FC, useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { useDashboardMetrics } from "./hooks/useDashboardMetrics";
import { KpiTile } from "./components/KpiTile";
import { CallsOverTimeChart } from "./components/CallsOverTimeChart";
import { RecentActivityList } from "./components/RecentActivityList";
import { QueueStatus } from "./components/QueueStatus";
import ServiceLevelTargetBlock from "./components/ServiceLevelTargetBlock";

export const Dashboard: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId: userOrgId, user, signOut, globalRole } = useAuth();
  const userRole = (user?.user_metadata as any)?.role || globalRole;
  
  // Admin can view any org via ?org_id= param, or see global stats with no param
  const paramOrgId = searchParams.get("org_id");
  const isAdmin = userRole === "admin";
  
  // For non-admins: always use their org
  // For admin:
  //   - if paramOrgId present => that org
  //   - if not present => null => global stats
  const effectiveOrgId = isAdmin ? (paramOrgId ? decodeURIComponent(paramOrgId) : null) : userOrgId;
  
  const { metrics, loading, error, retry } = useDashboardMetrics(effectiveOrgId);

  const [canManage, setCanManage] = useState(false);
  const [membersDebug, setMembersDebug] = useState<{ status: number | null; bodySnippet: string | null }>({ status: null, bodySnippet: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!effectiveOrgId || !user) { if (mounted) setCanManage(false); return; }
      if (isAdmin && paramOrgId) { if (mounted) setCanManage(true); return; }
      try {
        const resp = await fetch(`/api/orgs/${effectiveOrgId}/members`, { headers: { 'x-user-id': user.id || '' }, cache: 'no-store' });
        const status = resp.status;
        let snippet = null;
        try {
            // If endpoint missing (404) or otherwise unavailable, try a local fallback
            if (resp.status === 404) {
              const fallback = isAdmin || userRole === 'org_admin' || userRole === 'org_manager' || (user?.user_metadata?.org_id === effectiveOrgId);
              if (mounted) setCanManage(fallback);
              if (mounted) setMembersDebug({ status: resp.status, bodySnippet: null });
              return;
            }
            if (mounted) setCanManage(false);
            if (mounted) setMembersDebug({ status: resp.status, bodySnippet: null });
            return;
        } catch (e) {
          // could not parse JSON
          const txt = await resp.text().catch(() => '');
          snippet = txt.slice(0, 500);
          if (mounted) setCanManage(false);
        }
          const j = await resp.json();
          snippet = JSON.stringify(j?.members?.slice(0, 5) || j, null, 2).slice(0, 500);
          const me = (j.members || []).find((m: any) => m.user_id === user.id);
          if (me && (me.role === 'org_admin' || me.role === 'org_manager')) { if (mounted) setCanManage(true); }
          else if (mounted) setCanManage(false);
        if (mounted) setMembersDebug({ status, bodySnippet: snippet });
      } catch (e) { if (mounted) setCanManage(false); }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOrgId, user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // Non-admin without org is an error, but admin with null orgId is valid (global view)
  if (!isAdmin && !effectiveOrgId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-400 mb-4">
            No organization is linked to your account. Please contact support.
          </p>
        </div>
      </main>
    );
  }

  const answerRate = metrics?.answer_rate_today ?? 0;
  const avgWait = metrics?.avg_wait_seconds_today ?? 0;
  const totalCalls = metrics?.total_calls_today ?? 0;
  const answeredCalls = metrics?.answered_calls_today ?? 0;
  const missedCalls = Math.max(0, totalCalls - answeredCalls);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Top nav bar */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
              VS
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                VictorySync
              </p>
              <p className="text-sm font-medium text-slate-50">CX Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-pulse" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>Live</span>
            </div>
            {user && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-400">{user.email}</p>
                {userRole === "admin" && paramOrgId && (
                  <div className="inline-flex items-center rounded-full bg-slate-900/80 px-3 py-1 text-xs text-slate-300 border border-slate-700">
                    Viewing as: <span className="ml-1 font-semibold text-emerald-400">{paramOrgId.slice(0, 8)}...</span>
                  </div>
                )}
                {userRole === "admin" && (
                  <>
                    <Link
                      to="/admin/orgs"
                      className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                    >
                      Orgs
                    </Link>
                    <Link
                      to="/admin/users"
                      className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                    >
                      Users
                    </Link>
                    <Link
                      to="/admin/operations"
                      className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                    >
                      Operations
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-900/50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page title */}
        <header>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Live Call Performance
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                {isAdmin && !paramOrgId
                  ? "Today's call metrics across all organizations. Data refreshes automatically every 15 seconds."
                  : "Today's call metrics for the selected organization. Data refreshes automatically every 15 seconds."}
              </p>
            </div>
            {isAdmin && (
              <div className="rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 border border-slate-700">
                {paramOrgId ? (
                  <span>
                    <span className="text-slate-400">Viewing:</span>{" "}
                    <span className="font-semibold text-emerald-400">Single org</span>
                  </span>
                ) : (
                  <span>
                    <span className="text-slate-400">Viewing:</span>{" "}
                    <span className="font-semibold text-emerald-400">All orgs</span>
                  </span>
                )}
              </div>
            )}
            {/* Manage button for org admins/managers */}
            {canManage && effectiveOrgId && (
              <div>
                <button
                  onClick={() => navigate(`/orgs/${effectiveOrgId}/manage`)}
                  className="ml-3 px-3 py-1.5 bg-emerald-700/20 text-emerald-300 rounded text-sm hover:bg-emerald-700/30"
                >
                  Manage
                </button>
              </div>
            )}
            {/* Visible debug badge (temporary) */}
            <div className="ml-3 px-3 py-1.5 bg-slate-800/60 border border-slate-700 rounded text-xs text-slate-300">
              <div className="flex gap-2 items-center">
                <div className="text-[11px]">CanManage: <span className={`font-mono ${canManage ? 'text-emerald-300' : 'text-rose-400'}`}>{String(canManage)}</span></div>
                <div className="text-[11px]">Org: <span className="font-mono">{effectiveOrgId ?? 'none'}</span></div>
                <div className="text-[11px]">membersFetch: <span className="font-mono">{membersDebug.status ?? 'n/a'}</span></div>
              </div>
            </div>
            {/* Debug info (visible when ?debug=1) */}
            {searchParams.get('debug') === '1' && (
              <div className="ml-3 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 max-w-xs break-words">
                <div className="font-mono text-[11px]">members fetch: {membersDebug.status ?? 'n/a'}</div>
                {membersDebug.bodySnippet && <pre className="text-[11px] mt-1 whitespace-pre-wrap">{membersDebug.bodySnippet}</pre>}
              </div>
            )}
          </div>
        </header>

        {/* Primary KPI card */}
        <section className="relative">
          <div className="absolute inset-0 translate-y-6 blur-3xl opacity-40 bg-gradient-to-tr from-emerald-500/30 via-sky-500/20 to-slate-900" />
          <div className="relative rounded-2xl bg-slate-900/80 p-4 sm:p-5 shadow-2xl ring-1 ring-slate-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
              <KpiTile label="Answer rate (today)" value={`${answerRate.toFixed(0)}%`} />
              <KpiTile label="Avg wait" value={`${avgWait}s`} />
              <KpiTile label="Total calls (today)" value={`${totalCalls}`} />
              <KpiTile label="Answered calls" value={`${answeredCalls}`} />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <div>
                {loading ? (
                  <span>Loading metrics…</span>
                ) : error ? (
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400">Error: {error}</span>
                    <button className="text-xs text-emerald-400 underline" onClick={() => retry?.()}>Retry</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span>Stats refresh every 15 seconds based on today's calls.</span>
                    {metrics?.assignedPhones && metrics.assignedPhones.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-2">
                        <div className="font-semibold text-slate-300">Tracking {metrics.assignedPhones.length} phone(s):</div>
                        <div className="space-y-0.5 mt-1">
                          {metrics.assignedPhones.map((phone) => (
                            <div key={phone.id} className="text-emerald-400">
                              {phone.number} {phone.label ? `(${phone.label})` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div />
            </div>
          </div>
        </section>

        {/* Service Level Target + Secondary metrics grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <ServiceLevelTargetBlock
              orgId={effectiveOrgId}
              canEdit={isAdmin || userRole === "org_admin" || userRole === "org_manager"}
            />
          </div>

          <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
            <div className="text-sm text-slate-400">Today vs yesterday (answer rate)</div>
            <div className="mt-1 text-emerald-400 font-semibold">{Math.max(0, answerRate - 72)}%</div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
            <div className="text-sm text-slate-400">Missed calls (today)</div>
            <div className={`mt-1 font-semibold ${missedCalls > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {missedCalls}
            </div>
          </div>
        </div>

        {/* Grid: chart + queues + recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
              <h3 className="text-sm font-medium text-slate-200">Calls by hour</h3>
              <CallsOverTimeChart className="mt-3 h-48" orgId={effectiveOrgId} />
            </div>
          </div>

          <div>
            <QueueStatus orgId={effectiveOrgId} />
          </div>
        </div>

        {/* Recent activity */}
        <RecentActivityList orgId={effectiveOrgId} />
      </div>
    </main>
  );
};
