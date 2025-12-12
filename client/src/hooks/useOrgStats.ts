import { useEffect, useState } from 'react';
import { API_BASE_URL, buildApiUrl } from '../config';

export interface OrgStats {
  total_calls: number;
  answered_calls: number;
  missed_calls: number;
  answer_rate_pct: number;
}

export function useOrgStats(orgId: string | null | undefined) {
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(buildApiUrl(`/api/admin/orgs/${encodeURIComponent(orgId)}/stats`));
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!cancelled) {
          setStats(json.stats || {
            total_calls: 0,
            answered_calls: 0,
            missed_calls: 0,
            answer_rate_pct: 0,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('Error loading org stats:', e);
          setError(e?.message ?? 'Failed to load org stats');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { stats, loading, error };
}
