import React, { FC, useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { KpiTile } from "../components/KpiTile";
import { CallsOverTimeChart } from "../components/CallsOverTimeChart";
import { RecentActivityList } from "../components/RecentActivityList";
import { QueueStatus } from "../components/QueueStatus";
import ServiceLevelTargetBlock from "../components/ServiceLevelTargetBlock";
import { buildApiUrl } from "../config";

export const Dashboard: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgs, selectedOrgId, user, signOut, globalRole } = useAuth();
  const userRole = (user?.user_metadata as any)?.role || globalRole;
  
  // Admin can view any org via ?org_id= param, or see global stats with no param
  const paramOrgId = searchParams.get("org_id");
  const isAdmin = userRole === "admin" || globalRole === "platform_admin";

  // Determine effectiveOrgId:
  // - non-admins: use their selectedOrg (selectedOrgId)
  // - admins: paramOrgId -> param, else selectedOrgId (null means global)
  const effectiveOrgId = (() => {
    if (isAdmin) return paramOrgId ? decodeURIComponent(paramOrgId) : selectedOrgId ?? null;
    return selectedOrgId ?? null;
  })();
  
  const { metrics, loading, error, retry } = useDashboardMetrics(effectiveOrgId);

  const [canManage, setCanManage] = useState(false);
  const [membersDebug, setMembersDebug] = useState<{ status: number | null; bodySnippet: string | null }>({ status: null, bodySnippet: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!effectiveOrgId || !user) { if (mounted) setCanManage(false); return; }
      if (isAdmin && paramOrgId) { if (mounted) setCanManage(true); return; }
      try {
        const resp = await fetch(buildApiUrl(`/api/org-members?org_id=${encodeURIComponent(effectiveOrgId)}`), {
          headers: { 'x-user-id': user.id || '' }
        });
        let status = resp.status;
        let snippet = '';
        if (mounted) setMembersDebug({ status, bodySnippet: null });
        if (!resp.ok) { if (mounted) setCanManage(false); return; }
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
            <h1 className="text-2xl font-semibold">VictorySync</h1>
            {user && (
              <div className="flex items-center gap-2 ml-4 text-xs text-slate-400">
                <span>{user.email}</span>
                {isAdmin && <span className="px-2 py-1 bg-slate-800 rounded">admin</span>}
              </div>
            )}
            {/* Debug info (visible when ?debug=1) */}
            {searchParams.get('debug') === '1' && (
              <div className="ml-3 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 max-w-xs break-words">
                <div className="font-mono text-[11px]">members fetch: {membersDebug.status ?? 'n/a'}</div>
                {membersDebug.bodySnippet && <pre className="text-[11px] mt-1 whitespace-pre-wrap">{membersDebug.bodySnippet}</pre>}
              </div>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4">
              {canManage && (
                <>
                  <Link
                    to="/numbers"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Numbers
                  </Link>
                  <Link
                    to="/reports"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Reports
                  </Link>
                  <Link
                    to="/recordings"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Recordings
                  </Link>
                  <Link
                    to="/sms"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    SMS
                  </Link>
                  <Link
                    to={`/team${effectiveOrgId ? `?org_id=${encodeURIComponent(effectiveOrgId)}` : ''}`}
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Team
                  </Link>
                  <Link
                    to={`/operations${effectiveOrgId ? `?org_id=${encodeURIComponent(effectiveOrgId)}` : ''}`}
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Operations
                  </Link>
                </>
              )}
              {!canManage && (
                <>
                  <Link
                    to="/numbers"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Numbers
                  </Link>
                  <Link
                    to="/reports"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Reports
                  </Link>
                  <Link
                    to="/recordings"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Recordings
                  </Link>
                  <Link
                    to="/sms"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    SMS
                  </Link>
                  <Link
                    to="/support"
                    className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                  >
                    Support
                  </Link>
                </>
              )}
              {isAdmin && (
                <Link
                  to="/admin/mightycall"
                  className="text-xs text-slate-300 hover:text-emerald-400 transition underline-offset-2 hover:underline"
                >
                  Integrations
                </Link>
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
                  : "Today's metrics"}
              </p>
            </div>
            {isAdmin && paramOrgId && (
              <button
                onClick={() => navigate("/dashboard")}
                className="text-sm text-slate-300 hover:text-emerald-400 transition"
              >
                ← Back
              </button>
            )}
            {error && (
              <button
                onClick={retry}
                className="text-sm text-slate-300 hover:text-emerald-400 transition"
              >
                Retry
              </button>
            )}
          </div>
        </header>

        {/* KPI cards */}
        {loading ? (
          <div className="text-center text-slate-400">Loading...</div>
        ) : (
          <>
            <section className="relative">
              <div className="absolute inset-0 translate-y-6 blur-3xl opacity-40 bg-gradient-to-tr from-emerald-500/30 via-sky-500/20 to-slate-900" />
              <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiTile label="Total Calls" value={String(totalCalls)} />
                <KpiTile label="Answered" value={String(answeredCalls)} highlight="emerald" />
                <KpiTile label="Missed" value={String(missedCalls)} highlight="red" />
                <KpiTile
                  label="Answer Rate"
                  value={`${(answerRate * 100).toFixed(1)}%`}
                  highlight="sky"
                />
              </div>
            </section>

            {/* Service Level Target */}
            <ServiceLevelTargetBlock
              answerRate={answerRate}
              avgWait={avgWait}
              orgId={effectiveOrgId}
            />

            {/* Calls over time + Queue status */}
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
          </>
        )}
      </div>
    </main>
  );
};
