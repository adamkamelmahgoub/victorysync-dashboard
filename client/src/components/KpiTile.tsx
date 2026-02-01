import type { FC } from "react";

export const KpiTile: FC<{ label: string; value: string; highlight?: string }> = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => {
  return (
    <div className={`rounded-xl bg-slate-950/70 p-3 ${highlight ? '' : ''}`}>
      <div className="text-slate-400 text-[12px]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-emerald-400">{value}</div>
    </div>
  );
};
