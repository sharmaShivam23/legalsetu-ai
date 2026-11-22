"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, BellOff, Download, FileText, Folder, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate, todayInIndia } from "@/lib/rights-clock/dates";
import type { RightsClockInput, RightsClockResult } from "@/lib/rights-clock/engine";
import { canDraft, type ApplicationKind } from "@/lib/rights-clock/applications";
import { RightsClockResultView } from "./result-view";
import { TrackerForm, fromTracker, toTrackerBody, type TrackerFormValues } from "./tracker-form";

interface Tracker {
  id: string;
  caseId: string | null;
  personName: string;
  relationship: string | null;
  policeStation: string | null;
  firNumber: string | null;
  courtName: string | null;
  prisonName: string | null;
  remindersEnabled: boolean;
  updatedAt: string;
  input: RightsClockInput;
  result: RightsClockResult;
}

const DRAFTS: { kind: ApplicationKind; label: string; description: string }[] = [
  { kind: "default-bail", label: "Default bail application", description: "To the court, under BNSS §187(3)" },
  { kind: "section-479", label: "§479 release application", description: "To the court, after part-serving" },
  { kind: "jail-letter", label: "Letter to jail superintendent", description: "Asks the jail to apply, as §479(3) requires" },
];

export function TrackerDetail({ id }: { id: string }) {
  const router = useRouter();
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ApplicationKind | null>(null);
  const [chargesheetDate, setChargesheetDate] = useState("");
  const today = todayInIndia();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rights-clock/${id}`);
      if (res.status === 404) return setNotFound(true);
      const json = await res.json();
      if (json.success) setTracker(json.data.tracker);
      else setError(json.error?.message ?? "Could not load the tracker.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/rights-clock/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Could not save the change.");
        return false;
      }
      setTracker(json.data.tracker);
      return true;
    } catch {
      setError("Could not reach the server. Check your connection.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(values: TrackerFormValues) {
    if (await patch(toTrackerBody(values))) setEditing(false);
  }

  async function remove() {
    if (!window.confirm("Delete this tracker? Its reminders stop. The linked case is kept.")) return;
    setSaving(true);
    const res = await fetch(`/api/rights-clock/${id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (res?.ok) router.push("/dashboard/rights-clock");
    else setError("Could not delete the tracker. Please try again.");
  }

  async function download(kind: ApplicationKind) {
    setDownloading(kind);
    setError(null);
    try {
      const res = await fetch(`/api/rights-clock/${id}/application?kind=${kind}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not produce the draft.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `legalsetu-${kind}-draft.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Could not download the draft. Check your connection.");
    } finally {
      setDownloading(null);
    }
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-borderCustom bg-card p-10 text-center">
        <p className="text-sm font-semibold text-textPrimary">Tracker not found</p>
        <Link href="/dashboard/rights-clock" className="mt-3 inline-block text-sm font-semibold text-brandBlue">
          Back to Rights Clock
        </Link>
      </div>
    );
  }

  if (!tracker) {
    return (
      <div className="space-y-3" aria-busy="true">
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>
        ) : (
          [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-borderCustom bg-card" />)
        )}
      </div>
    );
  }

  const r = tracker.result;
  const custodyOpen = tracker.input.inCustody;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard/rights-clock" className="inline-flex items-center gap-1 text-xs font-semibold text-textSecondary hover:text-textPrimary">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All trackers
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-textPrimary">{tracker.personName}</h1>
          <p className="mt-1 text-xs text-textSecondary">
            Arrested {formatDate(tracker.input.arrestDate)}
            {tracker.firNumber && ` · FIR ${tracker.firNumber}`}
            {tracker.policeStation && ` · ${tracker.policeStation}`}
            {!custodyOpen && " · released"}
          </p>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {tracker.caseId && (
              <Link
                href={`/dashboard/cases/${tracker.caseId}`}
                className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-3 py-2 text-xs font-semibold text-textPrimary hover:bg-canvas"
              >
                <Folder className="h-3.5 w-3.5" aria-hidden /> Case
              </Link>
            )}
            <button
              type="button"
              onClick={() => patch({ remindersEnabled: !tracker.remindersEnabled })}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-3 py-2 text-xs font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
              aria-pressed={tracker.remindersEnabled}
            >
              {tracker.remindersEnabled ? <Bell className="h-3.5 w-3.5" aria-hidden /> : <BellOff className="h-3.5 w-3.5" aria-hidden />}
              {tracker.remindersEnabled ? "Reminders on" : "Reminders off"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-3 py-2 text-xs font-semibold text-textPrimary hover:bg-canvas"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-500/5 disabled:opacity-50 dark:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      {editing ? (
        <TrackerForm
          initial={fromTracker(tracker)}
          submitLabel="Save changes"
          submitting={saving}
          serverError={null}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {custodyOpen && (
            <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-borderCustom bg-card p-4" aria-label="Quick updates">
              {!tracker.input.chargesheetFiledOn ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-semibold text-textPrimary">
                    Chargesheet filed?
                    <input
                      type="date"
                      value={chargesheetDate}
                      max={today}
                      onChange={(e) => setChargesheetDate(e.target.value)}
                      className="mt-1 block rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!chargesheetDate || saving}
                    onClick={() => patch({ chargesheetFiledOn: chargesheetDate })}
                    className="rounded-xl bg-brandBlue px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Record
                  </button>
                </div>
              ) : (
                <p className="text-xs text-textSecondary">
                  Chargesheet recorded as filed on{" "}
                  <span className="font-semibold text-textPrimary">{formatDate(tracker.input.chargesheetFiledOn)}</span>.
                </p>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (window.confirm(`Mark ${tracker.personName} as released? Reminders stop.`)) void patch({ inCustody: false });
                }}
                className="ml-auto rounded-xl border border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/5 disabled:opacity-50 dark:text-emerald-400"
              >
                Released from custody
              </button>
              {saving && <Loader2 className="h-4 w-4 animate-spin text-textSecondary" aria-label="Saving" />}
            </section>
          )}

          <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Application drafts">
            <div className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-brandBlue" aria-hidden />
              <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Application drafts (PDF)</h2>
            </div>
            <p className="mt-1 text-xs text-textSecondary">
              Filled in from this tracker. Anything not entered stays as a [blank]. Have a lawyer or Legal Aid counsel check it before filing.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {DRAFTS.map((d) => {
                const check = canDraft(d.kind, r);
                return (
                  <button
                    key={d.kind}
                    type="button"
                    disabled={!check.ok || downloading !== null}
                    title={check.ok ? undefined : check.reason}
                    onClick={() => download(d.kind)}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                      check.ok
                        ? "border-brandBlue/40 hover:bg-brandBlue/5"
                        : "cursor-not-allowed border-borderCustom opacity-50"
                    )}
                  >
                    {downloading === d.kind ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brandBlue" aria-hidden />
                    ) : (
                      <Download className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
                    )}
                    <span>
                      <span className="block text-sm font-semibold text-textPrimary">{d.label}</span>
                      <span className="block text-xs text-textSecondary">{check.ok ? d.description : "Not applicable right now"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <RightsClockResultView result={r} />
        </>
      )}
    </div>
  );
}
