import { useEffect, useState } from "react";
import { getRecentCalls } from "../lib/apiClient";

export type RecentCall = {
  id: string;
  direction: string | null;
  status: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  duration?: number | null;
  queueName: string | null;
  agentName?: string | null;
  orgId?: string | null;
  orgName?: string | null;
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
          const normalized = (items || []).map((it: any) => ({
            id: it.id,
            direction: it.direction ?? null,
            status: it.status ?? null,
            fromNumber: it.from_number ?? it.fromNumber ?? null,
            toNumber: it.to_number ?? it.toNumber ?? null,
            startedAt: it.started_at ?? it.startedAt ?? '',
            duration: it.duration ?? it.call_duration ?? null,
            queueName: it.queue_name ?? it.queueName ?? null,
            agentName: it.agent_name ?? it.agentName ?? null,
            orgId: it.org_id ?? null,
            orgName: it.org_name ?? null,
          }));
          setCalls(normalized);
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
