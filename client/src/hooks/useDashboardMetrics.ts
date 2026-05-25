import { useEffect, useState } from 'react';
import { API_BASE_URL, buildApiUrl } from '../config';
import { fetchJson } from '../lib/apiClient';
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
      const baseUrl = API_BASE_URL || window.location.origin;
      const today = new Date().toISOString().slice(0, 10);
      const url = new URL(`${baseUrl}/api/reports/overview`);
      if (orgId) {
        url.searchParams.set('org_id', orgId);
      }
      url.searchParams.set('start_date', today);
      url.searchParams.set('end_date', today);

      const headers: Record<string, string> = {};
      if (user && user.id) headers['x-user-id'] = user.id;

      const json = await fetchJson(url.toString(), { headers });
      const overview = json.overview || {};
      const totalCalls = Number(overview.total_calls || 0);
      const answeredCalls = Number(overview.answered_calls || 0);
      const answerRatePct = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

      // Map backend response to frontend interface
      const answer_rate_today = answerRatePct;
      
      // For yesterday's rate, we'd need a separate call; for now use a default
      const answer_rate_yesterday = answer_rate_today * 0.9; // Placeholder
      const delta_pp = answer_rate_today - answer_rate_yesterday;

      // If orgId is set, fetch assigned phones for transparency
      let assignedPhones: Array<{ id: string; number: string; label?: string | null }> = [];
      if (orgId) {
        try {
          try {
            const numbersData = await fetchJson(buildApiUrl(`/api/reports/numbers?org_id=${encodeURIComponent(orgId)}&start_date=${today}&end_date=${today}`), { headers });
            assignedPhones = (numbersData.numbers || []).map((row: any) => ({ id: row.id, number: row.number, label: row.label }));
          } catch (e) {
            // keep assignedPhones empty on failure
            console.warn('Failed to fetch assigned phones:', e);
          }
        } catch (e) {
          console.warn('Failed to fetch assigned phones:', e);
        }
      }

      setMetrics({
        total_calls_today: totalCalls,
        answered_calls_today: answeredCalls,
        answer_rate_today,
        avg_wait_seconds_today: Number(overview.avg_wait_seconds || 0),
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

  return { metrics, loading, error, retry: fetchMetrics };
}
