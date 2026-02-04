import type { FC } from "react";
import { useState, useEffect } from "react";
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from "react-router-dom";
import { PageLayout } from '../../components/PageLayout';
import { API_BASE_URL, buildApiUrl } from '../../config';

type OrgMetrics = {
  id: string;
  name: string;
  total_calls: number;
  answered_calls: number;
  answer_rate_pct: number;
  avg_wait_seconds: number;
};

export const AdminOrgOverviewPage: FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatSecondsAsMinutes = (s: number | undefined | null) => {
    if (!s && s !== 0) return '0m 0s';
    const secs = Math.round(s || 0);
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}m ${sec}s`;
  };

  useEffect(() => {
    const fetchOrgMetrics = async () => {
      try {
        setError(null);
        const res = await fetch(buildApiUrl('/api/admin/org-metrics'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
        const json = await res.json();

        if (!res.ok) {
          setError(json.detail || "Failed to load organization metrics");
          return;
        }

        setOrgs(json.orgs || []);
      } catch (err: any) {
        console.error("Failed to fetch org metrics:", err);
        setError("An error occurred while loading organizations");
      } finally {
        setLoading(false);
      }
    };

    fetchOrgMetrics();
  }, []);

  return (
    <PageLayout title="Organization Overview" description="Today's metrics across all organizations.">
      <div className="space-y-6">
        {/* Metrics Grid */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Orgs table */}
        <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 overflow-hidden">
          {loading ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Loading organizations...
            </div>
          ) : orgs.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              No organizations found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">
                      Organization
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-300">
                      Answer Rate (%)
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-300">
                      Total Calls
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-300">
                      Answered
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-300">
                      Avg Wait
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-300">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr
                      key={org.id}
                      className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                    >
                      <td className="px-4 py-3 text-slate-200 font-medium">
                        {org.name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-1 rounded ${
                            org.answer_rate_pct >= 80
                              ? "bg-emerald-500/20 text-emerald-300"
                              : org.answer_rate_pct >= 60
                                ? "bg-yellow-500/20 text-yellow-300"
                                : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {org.answer_rate_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">
                        {org.total_calls.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">
                        {org.answered_calls.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">
                        {formatSecondsAsMinutes(org.avg_wait_seconds)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            navigate(`/dashboard?org_id=${encodeURIComponent(org.id)}`)
                          }
                          className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition"
                        >
                          View dashboard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};
