"use client";

// ==========================================================
// LegalSetu — what the assistant remembers
// ----------------------------------------------------------
// Shows every stored memory in plain language and lets the user
// delete any of them. Kept in Settings rather than buried,
// because "what does it know about me" should be a question a
// person can answer in one click when the answers can describe
// their legal troubles.
// ==========================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Trash2, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Memory {
  id: string;
  content: string;
  category: string;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  profile: "About you",
  ongoing_matter: "Ongoing matter",
  preference: "Preference",
  general: "Other",
};

export function MemoryManager() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) return;
      const json = await res.json();
      setMemories(json?.data?.memories ?? []);
    } catch {
      // Non-fatal — the rest of Settings still works.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    setBusy(id);
    const previous = memories;
    setMemories((m) => m.filter((x) => x.id !== id));
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Forgotten.");
    } catch {
      setMemories(previous);
      toast.error("Could not delete that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    setBusy("all");
    const previous = memories;
    setMemories([]);
    setConfirmClear(false);
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      toast.success("All memories cleared.");
    } catch {
      setMemories(previous);
      toast.error("Could not clear your memories.");
    } finally {
      setBusy(null);
    }
  }

  const grouped = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <Card className="mt-6 border-borderCustom bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-brandBlue" />
          <CardTitle className="text-textPrimary">What LegalSetu remembers</CardTitle>
        </div>

        {memories.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void clearAll()}
                className="rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-500/10"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg p-1 text-textSecondary hover:bg-canvas"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-lg border border-borderCustom px-2.5 py-1 text-xs font-medium text-textSecondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
            >
              Clear all
            </button>
          ))}
      </CardHeader>

      <CardContent>
        <p className="text-xs leading-relaxed text-textSecondary">
          To save you repeating yourself, LegalSetu keeps a few notes from
          earlier conversations. You can delete any of them at any time.
          Passwords, OTPs, card, Aadhaar and PAN numbers are never stored.
        </p>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-xs text-textSecondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}

        {!loading && memories.length === 0 && (
          <p className="mt-4 rounded-xl border border-borderCustom bg-canvas p-4 text-center text-xs text-textSecondary">
            Nothing remembered yet. As you use LegalSetu, useful context will
            appear here.
          </p>
        )}

        {!loading &&
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mt-4">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-textSecondary">
                {CATEGORY_LABELS[category] ?? category}
              </h4>
              <ul className="mt-2 space-y-1.5">
                {items.map((m) => (
                  <li
                    key={m.id}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-borderCustom bg-canvas px-3 py-2"
                  >
                    <span className="text-sm leading-relaxed text-textPrimary" data-no-translate>
                      {m.content}
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(m.id)}
                      disabled={busy === m.id}
                      aria-label="Forget this"
                      title="Forget this"
                      className="shrink-0 rounded-md p-1 text-textSecondary opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                    >
                      {busy === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
