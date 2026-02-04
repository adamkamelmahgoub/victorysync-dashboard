import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { supabase as supabaseClient } from '../lib/supabaseClient';

interface Call {
  id: string;
  org_id: string;
  phone_number_id: string;
  phone_number?: string;
  caller?: string;
  callee?: string;
  duration: number;
  call_type?: string;
  recorded?: boolean;
  created_at: string;
}

interface KPI {
  totalCalls: number;
  totalDuration: number;
  avgDuration: number;
  recordedCalls: number;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export const ReportPage: React.FC = () => {
  const { user } = useAuth();
  const { org: currentOrg } = useOrg();
  const [calls, setCalls] = useState<Call[]>([]);
  const [kpis, setKpis] = useState<KPI>({
    totalCalls: 0,
    totalDuration: 0,
    avgDuration: 0,
    recordedCalls: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Load initial data
  useEffect(() => {
    const loadCalls = async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/api/orgs/${currentOrg?.id}/calls`),
          {
            headers: { 'x-user-id': user?.id || '' },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setCalls(data.calls || []);
          calculateKPIs(data.calls || []);
        }
      } catch (error) {
        console.error('Failed to load calls:', error);
      } finally {
        setLoading(false);
      }
    };

    if (currentOrg?.id) {
      loadCalls();
    }
  }, [currentOrg?.id, user?.id]);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabaseClient
      .channel(`calls:org_id=eq.${currentOrg?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `org_id=eq.${currentOrg?.id}`,
        },
        (payload) => {
          console.log('[Realtime] Call update:', payload);
          
          if (payload.eventType === 'INSERT') {
            setCalls((prev) => [...prev, payload.new as Call]);
          } else if (payload.eventType === 'UPDATE') {
            setCalls((prev) =>
              prev.map((c) => (c.id === payload.new.id ? (payload.new as Call) : c))
            );
          } else if (payload.eventType === 'DELETE') {
            setCalls((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
          
          // Recalculate KPIs
          const updatedCalls = payload.eventType === 'INSERT' 
            ? [...calls, payload.new as Call]
            : payload.eventType === 'UPDATE'
            ? calls.map((c) => (c.id === payload.new.id ? (payload.new as Call) : c))
            : calls.filter((c) => c.id !== payload.old.id);
          calculateKPIs(updatedCalls);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentOrg?.id]);

  const calculateKPIs = (callList: Call[]) => {
    const totalCalls = callList.length;
    const totalDuration = callList.reduce((sum, call) => sum + (call.duration || 0), 0);
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const recordedCalls = callList.filter((c) => c.recorded).length;

    setKpis({
      totalCalls,
      totalDuration,
      avgDuration,
      recordedCalls,
    });
  };

  const filteredCalls = calls.filter((call) => {
    if (filter === 'recorded') return call.recorded;
    if (filter === 'today') {
      const today = new Date().toDateString();
      return new Date(call.created_at).toDateString() === today;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Call Reports</h1>
          <p className="text-slate-400">Real-time call analytics and metrics</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            label="Total Calls"
            value={kpis.totalCalls}
            color="cyan"
          />
          <KPICard
            label="Total Duration"
            value={formatDuration(kpis.totalDuration)}
            color="blue"
          />
          <KPICard
            label="Avg Duration"
            value={formatDuration(Math.round(kpis.avgDuration))}
            color="purple"
          />
          <KPICard
            label="Recorded"
            value={kpis.recordedCalls}
            color="green"
          />
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'all'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Calls
          </button>
          <button
            onClick={() => setFilter('recorded')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'recorded'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Recorded
          </button>
          <button
            onClick={() => setFilter('today')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'today'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Today
          </button>
        </div>

        {/* Calls List */}
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading calls...</div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No calls found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Caller</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Callee</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Duration</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      className="border-b border-slate-700 hover:bg-slate-800 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {new Date(call.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">{call.caller}</td>
                      <td className="px-6 py-3 text-sm text-slate-300">{call.callee}</td>
                      <td className="px-6 py-3 text-sm text-cyan-400 font-medium">
                        {formatDuration(call.duration)}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-400">{call.call_type}</td>
                      <td className="px-6 py-3 text-sm">
                        {call.recorded ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900 text-green-200">
                            ✓ Recorded
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface KPICardProps {
  label: string;
  value: string | number;
  color?: 'cyan' | 'blue' | 'purple' | 'green';
}

const KPICard: React.FC<KPICardProps> = ({ label, value, color = 'cyan' }) => {
  const colorClasses = {
    cyan: 'from-cyan-900 to-cyan-800 text-cyan-400',
    blue: 'from-blue-900 to-blue-800 text-blue-400',
    purple: 'from-purple-900 to-purple-800 text-purple-400',
    green: 'from-green-900 to-green-800 text-green-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-6 border border-slate-700`}>
      <p className="text-slate-300 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
};

export default ReportPage;
