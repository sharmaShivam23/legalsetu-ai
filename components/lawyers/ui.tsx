"use client";

import { BadgeCheck, FlaskConical, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Avatar({ name, photoUrl, size = 48 }: { name: string; photoUrl: string | null; size?: number }) {
  const initials = name
    .replace(/^(adv\.?|advocate)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return photoUrl ? (
    <img
      src={photoUrl}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover ring-1 ring-borderCustom"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-brandBlue/10 font-bold text-brandBlue ring-1 ring-brandBlue/20"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </span>
  );
}

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400",
        className
      )}
      title="Bar Council enrolment checked by LegalSetu"
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
      Verified
    </span>
  );
}

export function DemoBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400"
      title="A fictional profile for demonstrations — not a real advocate"
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      Demo profile
    </span>
  );
}

export function LegalAidBadge({ panel, proBono }: { panel: boolean; proBono: boolean }) {
  if (!panel && !proBono) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[11px] font-bold text-fuchsia-700 ring-1 ring-fuchsia-500/30 dark:text-fuchsia-400">
      <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
      {panel ? "Legal aid panel" : "Pro bono"}
    </span>
  );
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Waiting for reply", cls: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400" },
  ACCEPTED: { label: "Active", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400" },
  DECLINED: { label: "Declined", cls: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-400" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-500/10 text-textSecondary ring-borderCustom" },
  CLOSED: { label: "Closed", cls: "bg-slate-500/10 text-textSecondary ring-borderCustom" },
  DRAFT: { label: "Not submitted", cls: "bg-slate-500/10 text-textSecondary ring-borderCustom" },
  SUBMITTED: { label: "Under review", cls: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400" },
  VERIFIED: { label: "Verified", cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400" },
  REJECTED: { label: "Changes needed", cls: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-400" },
  SUSPENDED: { label: "Suspended", cls: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-400" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: "bg-canvas text-textSecondary ring-borderCustom" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", s.cls)}>{s.label}</span>;
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-borderCustom bg-canvas px-2 py-0.5 text-[11px] font-medium text-textSecondary">
      {children}
    </span>
  );
}
