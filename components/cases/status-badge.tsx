"use client";

import { cn } from "@/lib/utils/cn";

export type CaseStatusValue = "OPEN" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED" | "CLOSED";

export const STATUS_META: Record<
  CaseStatusValue,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  OPEN: {
    label: "Open",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  IN_PROGRESS: {
    label: "In progress",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  ESCALATED: {
    label: "Escalated",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
  },
  RESOLVED: {
    label: "Resolved",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  CLOSED: {
    label: "Closed",
    dot: "bg-slate-400",
    text: "text-textSecondary",
    bg: "bg-canvas",
    border: "border-borderCustom",
  },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status as CaseStatusValue] ?? STATUS_META.OPEN;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.bg,
        meta.border,
        meta.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
