import type { FC } from "react";
import { useRecentCalls } from "../hooks/useRecentCalls";

interface RecentActivityListProps {
  orgId: string | null | undefined;
}

export const RecentActivityList: FC<RecentActivityListProps> = ({ orgId }) => {
  const { calls, loading, error } = useRecentCalls(orgId);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatNumber = (num?: string | null) => {
    if (!num) return "Unknown";
    return num;
  };

  if (error) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Recent activity</h3>
        <p className="mt-3 text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Recent activity</h3>
        <p className="mt-3 text-xs text-slate-400">Loading...</p>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Recent activity</h3>
        <p className="mt-3 text-xs text-slate-400">No calls yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
      <h3 className="text-sm font-medium text-slate-200">Recent activity</h3>
      <ul className="mt-3 space-y-3 text-xs">
        {calls.map((call) => {
          const st = (call.status || "").toLowerCase();
          const isAnswered = st === "answered" || st === "completed";
          const isMissed = st === "missed";
          const direction = call.direction === "inbound" ? "Inbound" : "Outbound";
          const queueLabel = call.queueName || "Queue";
          const time = formatTime(call.startedAt);

          const pillClass = isAnswered
            ? "bg-emerald-500/20 text-emerald-300"
            : isMissed
            ? "bg-rose-500/20 text-rose-300"
            : "bg-slate-800/40 text-slate-300";

          const pillText = isAnswered ? "Answered" : isMissed ? "Missed" : (call.status || "Unknown");

          return (
            <li key={call.id} className="flex items-center justify-between border-b border-slate-800/50 pb-2 last:border-b-0">
              <div className="flex-1">
                <div className="text-slate-200 font-medium">
                  {formatNumber(call.fromNumber)} → {formatNumber(call.toNumber)}
                </div>
                <div className="text-slate-400">
                  {direction} · {queueLabel}
                </div>
                {call.agentName && (
                  <div className="text-slate-500 text-xs mt-0.5">
                    Agent: {call.agentName}
                  </div>
                )}
                <div className="text-slate-500 text-[10px] mt-0.5">
                  {time}
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${pillClass}`}>
                {pillText}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
