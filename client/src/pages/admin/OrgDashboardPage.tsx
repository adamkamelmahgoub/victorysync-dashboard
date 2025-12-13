import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrgPhoneMetrics } from '../../hooks/useOrgPhoneMetrics';
import { supabase } from '../../lib/supabaseClient';
import { buildApiUrl } from '../../config';
import { fetchJson } from '../../lib/apiClient';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

interface PhoneNumberInfo {
  id: string;
  number: string;
  label: string | null;
  e164: string | null;
}

interface PerNumberMetrics {
  phoneId: string;
  number: string;
  label: string | null;
  callsCount: number;
  answeredCount: number;
  missedCount: number;
  answerRate: number;
  avgSpeedSeconds?: number;
}

export function OrgDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Organization | null>(null);
  const [phones, setPhones] = useState<PhoneNumberInfo[]>([]);
  const [perNumberMetrics, setPerNumberMetrics] = useState<PerNumberMetrics[]>([]);
  const [daysBack, setDaysBack] = useState(1);
  const [loading, setLoading] = useState(true);
  const [perNumberLoading, setPerNumberLoading] = useState(false);
  const [perNumberError, setPerNumberError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const { data: metrics, isLoading: metricsLoading } = useOrgPhoneMetrics(orgId || null, daysBack);

  // Fetch per-number metrics
  const fetchPerNumberMetrics = async (phoneNumbers: PhoneNumberInfo[]) => {
    if (!orgId || phoneNumbers.length === 0) {
      setPerNumberMetrics([]);
      setPerNumberError(null);
      return;
    }

    try {
      setPerNumberLoading(true);
      setPerNumberError(null);
      
      // Use fetchJson with timeout instead of raw fetch; include range param for server-side optimization
      const rangeParam = daysBack === 1 ? 'today' : daysBack === 7 ? '7d' : daysBack === 30 ? '30d' : `custom`; 
      const qs = rangeParam === 'custom' ? `?start=${encodeURIComponent(new Date(Date.now() - daysBack*24*60*60*1000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}` : `?range=${rangeParam}`;
      const body = await fetchJson(`/api/admin/orgs/${orgId}/phone-metrics${qs}`);
      const metricsList = body.metrics || [];
      
      // Map to PerNumberMetrics shape
      const mapped = (metricsList || []).map((m: any) => ({
        phoneId: m.phoneId,
        number: m.number,
        label: m.label,
        callsCount: m.callsCount || 0,
        answeredCount: m.answeredCount || 0,
        missedCount: m.missedCount || 0,
        answerRate: m.answerRate || 0,
        avgSpeedSeconds: m.avgSpeedSeconds || 0,
      }));
      setPerNumberMetrics(mapped);
      setPerNumberError(null);
    } catch (err: any) {
      console.error('Failed to fetch per-number metrics:', err);
      setPerNumberMetrics([]);
      setPerNumberError(err?.message || 'Failed to load per-number metrics');
    } finally {
      setPerNumberLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) {
      setError('Organization ID not found');
      setLoading(false);
      return;
    }

    const fetchOrgData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch org details
        const res = await fetch(buildApiUrl('/api/admin/orgs/' + orgId), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
        if (!res.ok) throw new Error('Failed to fetch org details');
        const orgData = await res.json();
        const phonesList = (orgData.phones || []).map((p: any) => ({
          id: p.id,
          number: p.number,
          label: p.label,
          e164: p.e164,
        }));
        
        setOrg({
          id: orgId,
          name: orgData.name || 'Organization',
          created_at: orgData.created_at || new Date().toISOString(),
        });
        setPhones(phonesList);
        
        // Fetch per-number metrics
        await fetchPerNumberMetrics(phonesList);
      } catch (err: any) {
        console.error('Failed to fetch org data:', err);
        setError(err?.message || 'Failed to load organization');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, [orgId]);

  // Refetch per-number metrics when daysBack changes
  useEffect(() => {
    if (phones.length > 0) {
      fetchPerNumberMetrics(phones);
    }
  }, [daysBack]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-2">Loading organization dashboard...</div>
          <div className="text-xs text-slate-400">Please wait</div>
        </div>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/admin/orgs')}
            className="mb-6 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
          >
            ← Back to Organizations
          </button>
          <div className="rounded-lg border border-red-700/30 bg-red-900/20 p-6">
            <div className="text-lg font-semibold text-red-400 mb-2">Error</div>
            <div className="text-sm text-slate-300">{error || 'Organization not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/admin/orgs')}
              className="mb-3 text-sm text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
            >
              ← Back to Organizations
            </button>
            <h1 className="text-3xl font-bold mb-1">{org.name}</h1>
            <p className="text-sm text-slate-400">Organization dashboard</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">View:</label>
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(parseInt(e.target.value))}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm hover:border-slate-600 transition"
            >
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
        </div>

        {/* Phone Numbers Section */}
        {phones.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Assigned Phone Numbers ({phones.length})</h2>
            <div className="grid grid-cols-1 gap-2">
              {phones.map((phone) => (
                <div
                  key={phone.id}
                  className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium text-emerald-300">{phone.number}</div>
                    {phone.label && <div className="text-xs text-slate-400 mt-1">{phone.label}</div>}
                  </div>
                  {phone.e164 && <div className="text-xs text-slate-500">{phone.e164}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Section */}
        {metricsLoading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-sm">Loading metrics...</div>
          </div>
        ) : metrics ? (
          <div>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {/* Calls Today */}
              <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-6">
                <div className="text-sm text-slate-400 mb-2">Calls ({daysBack} day{daysBack > 1 ? 's' : ''})</div>
                <div className="text-4xl font-bold text-emerald-400 mb-2">{metrics.callsToday}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-400">Answered</div>
                    <div className="text-emerald-300 font-semibold">{metrics.answeredCalls}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Missed</div>
                    <div className="text-orange-400 font-semibold">{metrics.missedCalls}</div>
                  </div>
                </div>
              </div>

              {/* Answer Rate */}
              <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-6">
                <div className="text-sm text-slate-400 mb-2">Answer Rate</div>
                <div className="text-4xl font-bold text-blue-400 mb-2">{metrics.answerRate.toFixed(1)}%</div>
                <div className="text-xs text-slate-400">
                  {metrics.callsToday > 0
                    ? `${metrics.answeredCalls} of ${metrics.callsToday} calls answered`
                    : 'No calls in period'}
                </div>
              </div>

              {/* Average Handle Time */}
              <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-6">
                <div className="text-sm text-slate-400 mb-2">Avg Handle Time</div>
                <div className="text-4xl font-bold text-purple-400 mb-2">{metrics.avgHandleTime}s</div>
                <div className="text-xs text-slate-400">Average call duration</div>
              </div>

              {/* Average Speed of Answer */}
              <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-6">
                <div className="text-sm text-slate-400 mb-2">Avg Speed of Answer</div>
                <div className="text-4xl font-bold text-cyan-400 mb-2">{metrics.avgSpeedOfAnswer}s</div>
                <div className="text-xs text-slate-400">Average time to answer</div>
              </div>
            </div>

            {/* Empty state */}
            {metrics.callsToday === 0 && (
              <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/20 p-8 text-center">
                <div className="text-sm text-slate-400">No calls in this period</div>
                <div className="text-xs text-slate-500 mt-1">
                  Check back once calls have been logged
                </div>
              </div>
            )}

            {/* Per-Number Metrics Table */}
            {phones.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Metrics by Phone Number</h2>
                {perNumberLoading ? (
                  <div className="text-center py-8 text-slate-400 text-sm">Loading per-number metrics...</div>
                ) : perNumberError ? (
                  <div className="rounded-lg border border-red-700/30 bg-red-900/20 p-6">
                    <div className="text-sm text-red-400 font-semibold mb-3">{perNumberError}</div>
                    <button
                      onClick={() => fetchPerNumberMetrics(phones)}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-sm rounded transition"
                    >
                      Retry
                    </button>
                  </div>
                ) : perNumberMetrics.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/20 p-6 text-center">
                    <div className="text-sm text-slate-400">No call data available</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-300">Phone Number</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-300">Label</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-300">Total Calls</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-300">Answered</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-300">Missed</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-300">Avg Speed</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-300">Answer Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perNumberMetrics.map((metric) => (
                          <tr key={metric.phoneId} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                            <td className="px-4 py-3 text-sm font-medium text-emerald-300">{metric.number}</td>
                            <td className="px-4 py-3 text-sm text-slate-400">{metric.label || '—'}</td>
                            <td className="px-4 py-3 text-sm text-center text-slate-300">
                              <span className="inline-block px-2 py-1 bg-slate-700/50 rounded">{metric.callsCount}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="inline-block px-2 py-1 bg-emerald-900/40 text-emerald-300 rounded">
                                {metric.answeredCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="inline-block px-2 py-1 bg-orange-900/40 text-orange-300 rounded">
                                {metric.missedCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="inline-block px-2 py-1 bg-slate-700/30 rounded">{metric.avgSpeedSeconds ? `${metric.avgSpeedSeconds}s` : '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`inline-block px-2 py-1 rounded font-semibold ${
                                metric.answerRate >= 80
                                  ? 'bg-emerald-900/40 text-emerald-300'
                                  : metric.answerRate >= 50
                                  ? 'bg-blue-900/40 text-blue-300'
                                  : 'bg-red-900/40 text-red-300'
                              }`}>
                                {metric.answerRate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <div className="text-sm">Unable to load metrics</div>
          </div>
        )}
      </div>
    </div>
  );
}
