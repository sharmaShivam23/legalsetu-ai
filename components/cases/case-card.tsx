"use client";

import Link from "next/link";
import { MessagesSquare, FileText, FileSignature, MapPin, Clock, AlertCircle } from "lucide-react";
import { StatusBadge } from "./status-badge";

export interface CaseListItem {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  jurisdiction: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  updatedAt: string;
  conversationCount: number;
  documentCount: number;
  firDraftCount: number;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Renders the due-date chip, colour-coded by urgency — this is the
 *  detail that makes a case list feel like a tracker instead of an
 *  archive: overdue items visibly demand attention. */
function DueChip({ due }: { due: string }) {
  const date = new Date(due);
  const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000);
  const overdue = diffDays < 0;
  const soon = diffDays >= 0 && diffDays <= 3;

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold " +
        (overdue
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : soon
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-canvas text-textSecondary")
      }
    >
      <AlertCircle className="h-2.5 w-2.5" />
      {overdue ? "Overdue" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </span>
  );
}

export function CaseCard({ item }: { item: CaseListItem }) {
  return (
    <Link
      href={`/dashboard/cases/${item.id}`}
      className="group block rounded-2xl border border-borderCustom bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brandBlue/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[15px] font-semibold text-textPrimary group-hover:text-brandBlue">
          {item.title}
        </h3>
        <StatusBadge status={item.status} className="shrink-0" />
      </div>

      {item.summary && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-textSecondary">
          {item.summary}
        </p>
      )}

      {item.nextAction && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-borderCustom bg-canvas px-2.5 py-1.5">
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-brandBlue">Next</span>
          <span className="min-w-0 flex-1 truncate text-xs text-textPrimary">{item.nextAction}</span>
          {item.nextActionDue && <DueChip due={item.nextActionDue} />}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-textSecondary">
        {item.jurisdiction && (
          <span className="flex items-center gap-1" data-no-translate>
            <MapPin className="h-3 w-3" />
            {item.jurisdiction}
          </span>
        )}
        <span className="flex items-center gap-1">
          <MessagesSquare className="h-3 w-3" />
          {item.conversationCount}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {item.documentCount}
        </span>
        <span className="flex items-center gap-1">
          <FileSignature className="h-3 w-3" />
          {item.firDraftCount}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {relativeTime(item.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
