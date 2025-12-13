import { useEffect, useState } from 'react';
import { API_BASE_URL, buildApiUrl } from '../config';
import { useAuth } from '../contexts/AuthContext';

export interface DashboardMetrics {
  total_calls_today: number;
  answered_calls_today: number;
  answer_rate_today: number;
  avg_wait_seconds_today: number;
  answer_rate_yesterday: number;
  delta_pp: number;
  assignedPhones?: Array<{ id: string; number: string; label?: string | null }>;
}

export function useDashboardMetrics(orgId: string | null | undefined) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line
  }, [orgId, user?.id]);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      // Call backend API which handles today's metrics and org filtering
      const baseUrl = API_BASE_URL || window.location.origin;
      const url = new URL(`${baseUrl}/api/client-metrics`);
      if (orgId) {
        url.searchParams.set('org_id', orgId);
      }

      const headers: Record<string, string> = {};
      if (user && user.id) headers['x-user-id'] = user.id;

      const json = await fetchJson(url.toString(), { headers });
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

      // If orgId is set, fetch assigned phones for transparency
      let assignedPhones: Array<{ id: string; number: string; label?: string | null }> = [];
      if (orgId) {
        try {
          try {
            const orgData = await fetchJson(buildApiUrl(`/api/admin/orgs/${orgId}`), { headers });
            assignedPhones = orgData.phones || [];
          } catch (e) {
            // keep assignedPhones empty on failure
            console.warn('Failed to fetch assigned phones:', e);
          }
        } catch (e) {
          console.warn('Failed to fetch assigned phones:', e);
        }
      }

      setMetrics({
        total_calls_today: metrics.total_calls ?? 0,
        answered_calls_today: metrics.answered_calls ?? 0,
        answer_rate_today,
        avg_wait_seconds_today: metrics.avg_wait_seconds ?? 0,
        answer_rate_yesterday,
        delta_pp,
        assignedPhones,
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
