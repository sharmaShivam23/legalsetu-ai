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
    <div className="space-y-4 rounded-xl border border-borderCustom bg-card p-4 shadow-sm">
      {/* Header & Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-textPrimary">
          Draft completeness
        </span>
        <span className={cn("text-base font-bold", textColor)}>
          {score}%
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
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
                ? "border-emerald-500/20 bg-emerald-500/10 text-textPrimary"
                : "border-borderCustom bg-canvas text-textSecondary"
            )}
          >
            <div className="flex items-center gap-1.5 truncate pr-2">
              {b.complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-textSecondary opacity-40" />
              )}
              <span className="truncate font-medium">{b.label}</span>
            </div>

            <span
              className={cn(
                "font-mono font-semibold",
                b.complete ? "text-emerald-700 dark:text-emerald-400" : "text-textSecondary"
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