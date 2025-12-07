import { useEffect, useState } from "react";
import { API_BASE_URL } from '../config';

export type RecentCall = {
  id: string;
  direction: string | null;
  status: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  queueName: string | null;
};

type UseRecentCallsResult = {
  calls: RecentCall[];
  loading: boolean;
  error: string | null;
};

export function useRecentCalls(orgId: string | null | undefined): UseRecentCallsResult {
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId === undefined) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const url = new URL(`${API_BASE_URL}/api/calls/recent`);
        url.searchParams.set('limit', '50');
        if (orgId) {
          url.searchParams.set('org_id', orgId);
        }
        
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`API error: ${res.statusText}`);
        
        const json = await res.json();
        if (!cancelled) {
          setCalls(json.items || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('Error loading recent calls:', e);
          setError(e?.message ?? "Failed to load recent calls");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orgId]);
  return { calls, loading, error };
}
