import type { FC } from "react";
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
  const { orgId: userOrgId, user, signOut } = useAuth();
  const userRole = (user?.user_metadata as any)?.role;
  
  // Admin can view any org via ?org_id= param, or see global stats with no param
  const paramOrgId = searchParams.get("org_id");
  const isAdmin = userRole === "admin";
  
  // For non-admins: always use their org
  // For admin:
  //   - if paramOrgId present => that org
  //   - if not present => null => global stats
  const effectiveOrgId = isAdmin ? (paramOrgId ? decodeURIComponent(paramOrgId) : null) : userOrgId;
  
  const { metrics, loading, error } = useDashboardMetrics(effectiveOrgId);

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
                  <span className="text-rose-400">Error: {error}</span>
                ) : (
                  <span>Stats refresh every 15 seconds based on today's calls.</span>
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
