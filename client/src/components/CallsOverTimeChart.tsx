import { useState, type FC } from "react";
import { useCallSeries, type CallSeriesRange } from "../hooks/useCallSeries";

interface CallsOverTimeChartProps {
  className?: string;
  orgId?: string | null;
}

export const CallsOverTimeChart: FC<CallsOverTimeChartProps> = ({
  className,
  orgId,
}: CallsOverTimeChartProps) => {
  const [range, setRange] = useState<CallSeriesRange>("day");
  const { points, loading, error } = useCallSeries(orgId, range);

  const formatBucketLabel = (bucketLabel: string, range: CallSeriesRange): string => {
    try {
      const date = new Date(bucketLabel);
      if (isNaN(date.getTime())) {
        // bucketLabel might already be a friendly label
        return bucketLabel;
      }

      if (range === "day") {
        const hh = date.getHours().toString().padStart(2, "0");
        return `${hh}:00`;
      } else if (range === "week" || range === "month") {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, "0");
        const d = date.getDate().toString().padStart(2, "0");
        return `${y}-${m}-${d}`;
      } else {
        return date.toLocaleString("en-US", { month: "short" });
      }
    } catch {
      return bucketLabel;
    }
  };

  if (error) {
    return (
      <div className={className}>
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (loading || points.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-slate-400">{loading ? "Loading..." : "No data"}</p>
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.totalCalls), 1);

  return (
    <div className={className}>
      {/* Range selector */}
      <div className="flex gap-1 mb-4">
        {(["day", "week", "month", "year"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              range === r
                ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {r === "day"
              ? "Day"
              : r === "week"
                ? "Week"
                : r === "month"
                  ? "Month"
                  : "Year"}
          </button>
        ))}
      </div>

      {/* Chart bars */}
      <div className="flex items-end gap-1 h-32">
        {points.map((point, i) => {
          const label = formatBucketLabel(point.bucketLabel, range);
          const percentage = (point.totalCalls / max) * 100;

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
              title={`${point.totalCalls} total`}
            >
              <div className="w-full">
                <div
                  className="w-full bg-emerald-500/80 group-hover:bg-emerald-500 transition"
                  style={{ height: `${percentage}%`, minHeight: "2px" }}
                />
              </div>
              <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition whitespace-nowrap">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
