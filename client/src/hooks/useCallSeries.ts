import { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

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

        const url = orgId
          ? `${API_BASE_URL}/api/calls/series?org_id=${encodeURIComponent(orgId)}&range=${range}`
          : `${API_BASE_URL}/api/calls/series?range=${range}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!cancelled) {
          // Server returns points in the shape: { bucketLabel, totalCalls, answered, missed }
          setPoints(json.points || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load call series");
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
