import type { FC } from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../../config";

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
  const [orgs, setOrgs] = useState<OrgMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgMetrics = async () => {
      try {
        setError(null);
        const res = await fetch(`${API_BASE_URL}/api/admin/org-metrics`);
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
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">
              Admin
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Organization overview
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Today's metrics across all organizations.
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 text-sm text-slate-300 hover:text-emerald-400 transition"
          >
            ← Back
          </button>
        </header>

        {/* Error banner */}
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
                      Avg Wait (s)
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
                        {org.avg_wait_seconds.toFixed(1)}
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
    </main>
  );
};
