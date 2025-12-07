import type { FC } from "react";

export const SecondaryMetricsRow: FC<{
  serviceLevelTarget: string;
  todayVsYesterday: number;
  missedCalls: number;
}> = ({ serviceLevelTarget, todayVsYesterday, missedCalls }: { serviceLevelTarget: string; todayVsYesterday: number; missedCalls: number }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <div className="text-sm text-slate-400">Service level target</div>
        <div className="mt-1 text-emerald-400 font-semibold">{serviceLevelTarget}</div>
      </div>

      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <div className="text-sm text-slate-400">Today vs yesterday (answer rate)</div>
        <div className="mt-1 text-emerald-400 font-semibold">{todayVsYesterday}%</div>
      </div>

      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <div className="text-sm text-slate-400">Missed calls (today)</div>
        <div className={`mt-1 font-semibold ${missedCalls > 0 ? "text-rose-400" : "text-emerald-400"}`}>
          {missedCalls}
        </div>
      </div>
    </div>
  );
};
