import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/apiClient';

export interface OrgMetrics {
  callsToday: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number; // 0-100
  avgHandleTime: number; // seconds
  avgSpeedOfAnswer: number; // seconds
}

interface MetricsResponse {
  callsToday: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number;
  avgHandleTime: number;
  avgSpeedOfAnswer: number;
}

export function useOrgPhoneMetrics(orgId: string | null, daysBack: number = 1) {
  const [data, setData] = useState<OrgMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use server endpoint aggregated totals (this delegates DB work to Postgres + function)
        const rangeParam = daysBack === 1 ? 'today' : daysBack === 7 ? '7d' : daysBack === 30 ? '30d' : 'custom';
        const qs = rangeParam === 'custom' ? `?start=${encodeURIComponent(new Date(Date.now() - daysBack*24*60*60*1000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}` : `?range=${rangeParam}`;
        const json = await fetchJson(`/api/admin/orgs/${orgId}/metrics${qs}`);
        const totals = json.totals || json || {};
        setData({
          callsToday: totals.callsToday || 0,
          answeredCalls: totals.answeredCalls || 0,
          missedCalls: totals.missedCalls || 0,
          answerRate: totals.answerRate || 0,
          avgHandleTime: totals.avgHandleTime || 0,
          avgSpeedOfAnswer: totals.avgSpeedOfAnswer || 0,
        });
      } catch (err: any) {
        console.error('Failed to fetch org metrics:', err);
        setError(err?.message || 'Failed to fetch metrics');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [orgId, daysBack]);

  return { data, isLoading, error };
}
