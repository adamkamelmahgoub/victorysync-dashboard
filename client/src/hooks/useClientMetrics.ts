// client/src/hooks/useClientMetrics.ts
import { useEffect, useRef, useState } from "react";
import { getClientMetrics } from "../lib/apiClient";

export type Metrics = {
  org_id?: string;
  total_calls: number;
  answered_calls: number;
  answer_rate_pct: number;
  avg_wait_seconds: number;
};

type UseClientMetricsResult = {
  data: Metrics | null;
  loading: boolean;
  error: string | null;
};

export function useClientMetrics(orgId: string | null | undefined): UseClientMetricsResult {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const lastGood = useRef<Metrics | null>(null);

  useEffect(() => {
    // For orgId=null (admin global view), continue loading
    // For orgId=undefined, skip loading (no org assigned)
    if (orgId === undefined) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const metrics: Metrics = await getClientMetrics(orgId ?? null);
        if (!cancelled) {
          setData(metrics);
          lastGood.current = metrics;
          setError(null);
        }
      } catch (e: any) {
        console.error("useClientMetrics error:", e);
        if (!cancelled) {
          setError(e?.message ?? "Failed to load metrics");
          // keep last good data
          setData(lastGood.current);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 15000); // refresh every 15s

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orgId]);

  return { data, loading, error };
}
