"use client";

import { cn } from "@/lib/utils/cn";
import type { CompletenessResult } from "@/lib/fir/completeness";

export function CompletenessMeter({ result }: { result: CompletenessResult }) {
  const { score, breakdown } = result;

  const barColor =
    score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-navy-900">Draft completeness</span>
        <span className="text-sm font-semibold text-navy-900">{score}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {breakdown.map((b) => (
          <div key={b.key} className="flex items-center justify-between text-xs">
            <span className={cn("text-slate-500", b.complete && "text-slate-400")}>
              {b.label}
            </span>
            <span
              className={cn(
                "font-medium",
                b.complete ? "text-emerald-600" : "text-slate-400"
              )}
            >
              {b.earned}/{b.weight}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
