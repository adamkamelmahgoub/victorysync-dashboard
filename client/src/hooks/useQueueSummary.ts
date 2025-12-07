import { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

export type QueueSummary = {
  name: string;
  totalCalls: number;
  answered: number;
  missed: number;
};

type UseQueueSummaryResult = {
  queues: QueueSummary[];
  loading: boolean;
  error: string | null;
};

export function useQueueSummary(orgId: string | null | undefined): UseQueueSummaryResult {
  const [queues, setQueues] = useState<QueueSummary[]>([]);
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
          ? `${API_BASE_URL}/api/calls/queue-summary?org_id=${encodeURIComponent(orgId)}`
          : `${API_BASE_URL}/api/calls/queue-summary`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!cancelled) {
          // Server returns queues as { name, totalCalls, answered, missed }
          setQueues(json.queues || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load queue summary");
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

  return { queues, loading, error };
}
