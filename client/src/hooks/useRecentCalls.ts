import { useEffect, useState } from "react";
import { getRecentCalls } from "../lib/apiClient";

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
        const items = await getRecentCalls({ orgId: orgId ?? undefined, limit: 50 });
        if (!cancelled) {
          setCalls(items || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('Error loading recent calls:', e);
          setError(e?.detail ?? e?.message ?? "Failed to load recent calls");
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
