import type { FC } from "react";
import { useQueueSummary } from "../hooks/useQueueSummary";

interface QueueStatusProps {
  orgId?: string | null;
}

export const QueueStatus: FC<QueueStatusProps> = ({ orgId }: QueueStatusProps) => {
  const { queues, loading, error } = useQueueSummary(orgId);

  if (error) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Queue status</h3>
        <p className="mt-3 text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Queue status</h3>
        <p className="mt-3 text-xs text-slate-400">Loading...</p>
      </div>
    );
  }

  if (queues.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Queue status</h3>
        <p className="mt-3 text-xs text-slate-400">No calls today.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
      <h3 className="text-sm font-medium text-slate-200">Queue status</h3>
      <div className="mt-4 space-y-3">
        {queues.map((queue, i) => {
          const name = queue.name || "No queue";
          const answeredPct =
            queue.totalCalls > 0 ? Math.round((queue.answered / queue.totalCalls) * 100) : 0;

          return (
            <div key={i} className="border-b border-slate-800/50 pb-3 last:border-b-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-200 font-medium">{name}</div>
                <div className="text-xs text-slate-400">
                  {queue.totalCalls} call{queue.totalCalls !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                <span className="text-emerald-400">{queue.answered} answered</span>
                {" · "}
                <span className="text-rose-400">{queue.missed} missed</span>
                {" · "}
                <span className="text-slate-500">{answeredPct}% rate</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
