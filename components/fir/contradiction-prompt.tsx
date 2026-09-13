"use client";

// ==========================================================
// LegalSetu — FIR Assistant: contradiction resolution
// ----------------------------------------------------------
// When two sources disagree, the user decides — never the app.
// Presented as a plain choice rather than an error, because a
// mismatch usually means an honest slip under stress, not a lie,
// and the tone should not suggest otherwise.
// ==========================================================

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import type { FIRCaseState } from "@/lib/fir/case-state";
import { describeContradiction } from "@/lib/fir/contradictions";

export function ContradictionPrompt({
  draftId,
  state,
  onResolved,
}: {
  draftId: string;
  state: FIRCaseState;
  onResolved: (next: FIRCaseState) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});

  const open = state.contradictions.filter((c) => !c.resolvedValue);
  if (open.length === 0) return null;

  async function resolve(id: string, value: string) {
    if (!value.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/fir/${draftId}/facts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions: [{ id, value }] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error();
      onResolved(json.data.state);
    } catch {
      toast.error("Could not save that. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {open.map((c) => (
        <div
          key={c.id}
          className={cn(
            "rounded-xl border p-4",
            c.blocking
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-borderCustom bg-canvas"
          )}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-textPrimary">
                This detail needs confirming
              </p>
              <p className="mt-1 text-xs leading-relaxed text-textSecondary">
                {describeContradiction(c)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {c.options.map((option) => (
                  <button
                    key={`${c.id}-${option.value}`}
                    type="button"
                    disabled={saving === c.id}
                    onClick={() => void resolve(c.id, option.value)}
                    data-no-translate
                    className="rounded-lg border border-borderCustom bg-card px-3 py-1.5 text-xs font-medium text-textPrimary transition-colors hover:border-brandBlue/50 hover:text-brandBlue disabled:opacity-50"
                  >
                    {option.value}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  value={custom[c.id] ?? ""}
                  onChange={(e) => setCustom((p) => ({ ...p, [c.id]: e.target.value }))}
                  placeholder="Or enter the correct detail"
                  className="min-w-0 flex-1 rounded-lg border border-borderCustom bg-card px-2.5 py-1.5 text-xs text-textPrimary outline-none focus:border-brandBlue"
                />
                <button
                  type="button"
                  disabled={saving === c.id || !(custom[c.id] ?? "").trim()}
                  onClick={() => void resolve(c.id, custom[c.id] ?? "")}
                  className="rounded-lg bg-brandBlue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Use this"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
