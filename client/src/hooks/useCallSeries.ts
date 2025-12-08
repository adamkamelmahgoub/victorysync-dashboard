import { useEffect, useState } from "react";
import { getCallSeries } from "../lib/apiClient";

export type CallSeriesPoint = {
  bucketLabel: string;
  totalCalls: number;
  answered?: number;
  missed?: number;
};

type UseCallSeriesResult = {
  points: CallSeriesPoint[];
  loading: boolean;
  error: string | null;
};

export type CallSeriesRange = "day" | "week" | "month" | "year";

export function useCallSeries(
  orgId: string | null | undefined,
  range: CallSeriesRange = "day"
): UseCallSeriesResult {
  const [points, setPoints] = useState<CallSeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId === undefined) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const pts = await getCallSeries({ orgId: orgId ?? undefined, range });
        if (!cancelled) {
          setPoints(pts || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.detail ?? e?.message ?? "Failed to load call series");
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
  }, [orgId, range]);

  return { points, loading, error };
}
