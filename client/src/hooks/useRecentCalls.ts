import { useEffect, useState } from "react";
import { getRecentCalls, triggerMightyCallRecentCallsSync } from "../lib/apiClient";

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
    void load();
    // Pull the latest supported /calls data for the selected organization, then
    // keep the visible list current while the dashboard is open.
    if (orgId) {
      void triggerMightyCallRecentCallsSync(orgId)
        .then(() => load())
        .catch((syncError: any) => {
          if (!cancelled) {
            setError(syncError?.detail || syncError?.message || 'MightyCall could not refresh recent calls. Check the integration credentials.');
          }
        });
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [orgId]);
  return { calls, loading, error };
}
