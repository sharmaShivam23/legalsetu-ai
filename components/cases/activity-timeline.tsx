"use client";

import { MessagesSquare, FileText, FileSignature, FolderPlus } from "lucide-react";

interface TimelineEntry {
  id: string;
  type: "conversation" | "document" | "firDraft" | "created";
  label: string;
  at: string;
}

const ICONS = {
  conversation: MessagesSquare,
  document: FileText,
  firDraft: FileSignature,
  created: FolderPlus,
} as const;

const COLORS = {
  conversation: "bg-blue-500",
  document: "bg-violet-500",
  firDraft: "bg-amber-500",
  created: "bg-slate-400",
} as const;

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (sorted.length === 0) return null;

  return (
    <div className="rounded-2xl border border-borderCustom bg-card p-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-textSecondary">Activity</h3>
      <ol className="relative mt-4 space-y-5 border-l border-borderCustom pl-5">
        {sorted.map((entry) => {
          const Icon = ICONS[entry.type];
          return (
            <li key={entry.id} className="relative">
              <span
                className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full ${COLORS[entry.type]} ring-4 ring-card`}
              >
                <Icon className="h-2.5 w-2.5 text-white" />
              </span>
              <p className="text-xs text-textPrimary">{entry.label}</p>
              <p className="text-[10px] text-textSecondary">
                {new Date(entry.at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
