import { useEffect, useRef, useState } from 'react';
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
  const { user, globalRole } = useAuth();
  const hasLoadedOnce = useRef(false);
  const requestInFlight = useRef(false);

  useEffect(() => {
    fetchMetrics();
    const id = window.setInterval(() => fetchMetrics({ silent: true }), 15_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line
  }, [orgId, user?.id, globalRole]);

  function dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  function previousDateKey(date: Date) {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    return dateKey(previous);
  }

  function answerRate(overview: any) {
    const totalCalls = Number(overview?.total_calls || 0);
    const answeredCalls = Number(overview?.answered_calls || 0);
    return totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  }

  async function fetchMetrics(options?: { silent?: boolean }) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const silent = options?.silent === true || hasLoadedOnce.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      const now = new Date();
      const today = dateKey(now);
      const yesterday = previousDateKey(now);
      const url = new URL(`${baseUrl}/api/reports/overview`);
      if (orgId) {
        url.searchParams.set('org_id', orgId);
      }
      url.searchParams.set('start_date', today);
      url.searchParams.set('end_date', today);
      url.searchParams.set('_fresh', String(Date.now()));

      const yesterdayUrl = new URL(`${baseUrl}/api/reports/overview`);
      if (orgId) {
        yesterdayUrl.searchParams.set('org_id', orgId);
      }
      yesterdayUrl.searchParams.set('start_date', yesterday);
      yesterdayUrl.searchParams.set('end_date', yesterday);
      yesterdayUrl.searchParams.set('_fresh', String(Date.now()));

      const headers: Record<string, string> = {};
      if (user && user.id) headers['x-user-id'] = user.id;

      const [json, yesterdayJson] = await Promise.all([
        fetchJson(url.toString(), { headers, cache: 'no-store' }),
        fetchJson(yesterdayUrl.toString(), { headers, cache: 'no-store' }).catch(() => ({ overview: {} })),
      ]);
      const overview = json.overview || {};
      const yesterdayOverview = yesterdayJson.overview || {};
      const totalCalls = Number(overview.total_calls || 0);
      const answeredCalls = Number(overview.answered_calls || 0);

      const answer_rate_today = answerRate(overview);
      const answer_rate_yesterday = answerRate(yesterdayOverview);
      const delta_pp = answer_rate_today - answer_rate_yesterday;

      setMetrics((current) => ({
        total_calls_today: totalCalls,
        answered_calls_today: answeredCalls,
        answer_rate_today,
        avg_wait_seconds_today: Number(overview.avg_wait_seconds || 0),
        answer_rate_yesterday,
        delta_pp,
        assignedPhones: current?.assignedPhones || [],
      }));
      hasLoadedOnce.current = true;

      const isAdmin = ['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''));
      const numbersPath = orgId
        ? `/api/orgs/${encodeURIComponent(orgId)}/phone-numbers?_fresh=${Date.now()}`
        : isAdmin
          ? `/api/admin/phone-numbers?_fresh=${Date.now()}`
          : `/api/reports/numbers?start_date=${today}&end_date=${today}&_fresh=${Date.now()}`;
      void fetchJson(buildApiUrl(numbersPath), { headers, cache: 'no-store' })
        .then((numbersData) => {
          const rows = numbersData.phone_numbers || numbersData.numbers || [];
          const assignedPhones = rows.map((row: any) => ({
            id: row.id || row.phone_number_id || row.number,
            number: row.number || row.phone_number || row.business_number || row.e164,
            label: row.label || row.organization_name || null,
          })).filter((row: any) => row.number);
          setMetrics((current) => current ? { ...current, assignedPhones } : current);
        })
        .catch((e) => console.warn('Failed to fetch assigned phones:', e));
    } catch (err: any) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err?.message ?? 'Failed to fetch metrics');
    } finally {
      requestInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }

  return { metrics, loading, error, retry: fetchMetrics };
}
