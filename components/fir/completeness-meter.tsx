"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CompletenessResult } from "@/lib/fir/completeness";

export function CompletenessMeter({ result }: { result: CompletenessResult }) {
  const { score, breakdown } = result;

  const barColor =
    score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-rose-500";

  const textColor =
    score >= 80 
      ? "text-emerald-700 dark:text-emerald-400" 
      : score >= 50 
      ? "text-amber-700 dark:text-amber-400" 
      : "text-rose-700 dark:text-rose-400";

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 p-4 shadow-sm transition-colors duration-200">
      {/* Header & Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Draft completeness
        </span>
        <span className={cn("text-base font-bold", textColor)}>
          {score}%
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn("h-full transition-all duration-500 ease-out", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Itemized Breakdown Grid */}
      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
        {breakdown.map((b) => (
          <div
            key={b.key}
            className={cn(
              "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
              b.complete
                ? "border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/10 text-slate-800 dark:text-slate-200"
                : "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400"
            )}
          >
            <div className="flex items-center gap-1.5 truncate pr-2">
              {b.complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
              )}
              <span className="truncate font-medium">{b.label}</span>
            </div>

            <span
              className={cn(
                "font-mono font-semibold",
                b.complete ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
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