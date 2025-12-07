import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

export interface DashboardMetrics {
  total_calls_today: number;
  answered_calls_today: number;
  answer_rate_today: number;
  avg_wait_seconds_today: number;
  answer_rate_yesterday: number;
  delta_pp: number;
}

export function useDashboardMetrics(orgId: string | null | undefined) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      // Call backend API which handles today's metrics and org filtering
      const url = new URL(`${API_BASE_URL}/api/client-metrics`);
      if (orgId) {
        url.searchParams.set('org_id', orgId);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API error: ${res.statusText}`);
      
      const json = await res.json();
      const metrics = json.metrics || {
        total_calls: 0,
        answered_calls: 0,
        answer_rate_pct: 0,
        avg_wait_seconds: 0,
      };

      // Map backend response to frontend interface
      const answer_rate_today = metrics.answer_rate_pct ?? 0;
      
      // For yesterday's rate, we'd need a separate call; for now use a default
      const answer_rate_yesterday = answer_rate_today * 0.9; // Placeholder
      const delta_pp = answer_rate_today - answer_rate_yesterday;

      setMetrics({
        total_calls_today: metrics.total_calls ?? 0,
        answered_calls_today: metrics.answered_calls ?? 0,
        answer_rate_today,
        avg_wait_seconds_today: metrics.avg_wait_seconds ?? 0,
        answer_rate_yesterday,
        delta_pp,
      });
    } catch (err: any) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err?.message ?? 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }

  return { metrics, loading, error };
}
