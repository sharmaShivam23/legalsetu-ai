"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/rights-clock/dates";
import type { RightsClockResult } from "@/lib/rights-clock/engine";
import { TrackerForm, toTrackerBody, type TrackerFormValues } from "./tracker-form";

interface TrackerListItem {
  id: string;
  personName: string;
  updatedAt: string;
  result: RightsClockResult;
}

function statusLine(r: RightsClockResult): { text: string; urgent: boolean } {
  if (r.nextAction) return { text: r.nextAction.text, urgent: r.nextAction.urgent };
  return { text: r.defaultBail.headline, urgent: false };
}

export function RightsClockHome() {
  const router = useRouter();
  const [trackers, setTrackers] = useState<TrackerListItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rights-clock");
        const json = await res.json();
        if (!json.success) throw new Error();
        setTrackers(json.data.trackers);
        if (json.data.trackers.length === 0) setCreating(true);
      } catch {
        setLoadError(true);
        setTrackers([]);
        setCreating(true);
      }
    })();
  }, []);

  async function save(values: TrackerFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rights-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toTrackerBody(values)),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Could not save. Please try again.");
        return;
      }
      router.push(`/dashboard/rights-clock/${json.data.tracker.id}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-textPrimary">
          Your saved trackers could not be loaded right now. You can still calculate below.
        </p>
      )}

      {trackers && trackers.length > 0 && (
        <section aria-label="Saved trackers">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-textPrimary">Your trackers</h2>
            {!creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden />
                New tracker
              </button>
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {trackers.map((t) => {
              const s = statusLine(t.result);
              return (
                <li key={t.id}>
                  <Link
                    href={`/dashboard/rights-clock/${t.id}`}
                    className={cn(
                      "group flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-brandBlue/50",
                      s.urgent ? "border-rose-500/50" : "border-borderCustom"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brandBlue/10">
                      <UserRound className="h-5 w-5 text-brandBlue" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-textPrimary">{t.personName}</p>
                      <p className={cn("mt-0.5 line-clamp-2 text-xs leading-relaxed", s.urgent ? "font-semibold text-rose-700 dark:text-rose-400" : "text-textSecondary")}>
                        {s.urgent && "● "}
                        {s.text}
                      </p>
                      {t.result.nextAction?.due && (
                        <p className="mt-1 text-[11px] text-textSecondary">Due {formatDate(t.result.nextAction.due)}</p>
                      )}
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-textSecondary transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {trackers === null && (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-borderCustom bg-card" />
          ))}
        </div>
      )}

      {creating && trackers !== null && (
        <section aria-label="New tracker">
          {trackers.length > 0 && <h2 className="mb-3 text-sm font-bold text-textPrimary">New tracker</h2>}
          <TrackerForm
            submitLabel="Save & track deadlines"
            submitting={submitting}
            serverError={error}
            onSubmit={save}
            onCancel={trackers.length > 0 ? () => setCreating(false) : undefined}
          />
        </section>
      )}
    </div>
  );
}
