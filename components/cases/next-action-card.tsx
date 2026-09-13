"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Target, Loader2, Check, Pencil, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function NextActionCard({
  caseId,
  nextAction,
  nextActionDue,
  onSaved,
}: {
  caseId: string;
  nextAction: string | null;
  nextActionDue: string | null;
  onSaved: (patch: { nextAction: string | null; nextActionDue: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextAction ?? "");
  const [due, setDue] = useState(nextActionDue ? nextActionDue.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      onSaved({
        nextAction: json.data.case.nextAction,
        nextActionDue: json.data.case.nextActionDue,
      });
      setEditing(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const dueDate = nextActionDue ? new Date(nextActionDue) : null;
  const diffDays = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000) : null;
  const overdue = diffDays !== null && diffDays < 0;
  const soon = diffDays !== null && diffDays >= 0 && diffDays <= 3;

  if (editing) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-brandBlue/40 bg-brandBlue/5 p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brandBlue">
          <Target className="h-3.5 w-3.5" />
          What's next
        </div>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Follow up with the police station"
          maxLength={300}
          className="mt-2.5 w-full rounded-lg border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-borderCustom bg-card px-2.5 py-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-textSecondary" />
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="bg-transparent text-xs text-textPrimary outline-none"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void save({
                nextAction: text.trim() || null,
                nextActionDue: due ? new Date(due).toISOString() : null,
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-brandBlue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-textSecondary hover:bg-canvas"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!nextAction) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-borderCustom bg-card p-5 text-left transition-colors hover:border-brandBlue/40"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas">
          <Target className="h-4 w-4 text-textSecondary" />
        </div>
        <div>
          <p className="text-sm font-medium text-textPrimary">Set a next action</p>
          <p className="text-xs text-textSecondary">Keep track of what needs to happen next on this case.</p>
        </div>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-5",
        overdue
          ? "border-rose-500/40 bg-rose-500/5"
          : soon
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-brandBlue/30 bg-brandBlue/5"
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          overdue ? "bg-rose-500/15" : soon ? "bg-amber-500/15" : "bg-brandBlue/15"
        )}
      >
        <Target
          className={cn(
            "h-4 w-4",
            overdue ? "text-rose-600" : soon ? "text-amber-600" : "text-brandBlue"
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-textSecondary">
          Next action
        </p>
        <p className="mt-0.5 text-sm font-medium text-textPrimary">{nextAction}</p>
        {dueDate && (
          <p
            className={cn(
              "mt-1 text-xs font-semibold",
              overdue ? "text-rose-600 dark:text-rose-400" : soon ? "text-amber-700 dark:text-amber-400" : "text-textSecondary"
            )}
          >
            {overdue
              ? `Overdue by ${Math.abs(diffDays!)} day${Math.abs(diffDays!) === 1 ? "" : "s"}`
              : `Due ${dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-textSecondary hover:bg-card hover:text-textPrimary"
          aria-label="Edit next action"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ nextAction: null, nextActionDue: null })}
          className="rounded-lg p-1.5 text-textSecondary hover:bg-card hover:text-emerald-600"
          aria-label="Mark done"
          title="Mark done"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
