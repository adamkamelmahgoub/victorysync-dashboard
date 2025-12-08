import { useEffect, useState } from "react";
import { getQueueSummary } from "../lib/apiClient";

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
        const q = await getQueueSummary({ orgId: orgId ?? undefined });
        if (!cancelled) {
          setQueues(q || []);
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
