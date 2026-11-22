"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { todayInIndia } from "@/lib/rights-clock/dates";
import type { RightsClockInput, RightsClockResult, TriState } from "@/lib/rights-clock/engine";
import { RightsClockResultView } from "./result-view";

export interface TrackerFormValues {
  personName: string;
  relationship: string;
  arrestDate: string;
  firstRemandDate: string;
  sectionsText: string;
  otherLawCharges: boolean;
  chargesheetFiled: boolean;
  chargesheetFiledOn: string;
  priorConviction: TriState;
  otherPendingCases: TriState;
  inCustody: boolean;
  firNumber: string;
  policeStation: string;
  courtName: string;
  prisonName: string;
  remindersEnabled: boolean;
}

export const EMPTY_FORM: TrackerFormValues = {
  personName: "",
  relationship: "",
  arrestDate: "",
  firstRemandDate: "",
  sectionsText: "",
  otherLawCharges: false,
  chargesheetFiled: false,
  chargesheetFiledOn: "",
  priorConviction: "UNKNOWN",
  otherPendingCases: "UNKNOWN",
  inCustody: true,
  firNumber: "",
  policeStation: "",
  courtName: "",
  prisonName: "",
  remindersEnabled: true,
};

/** "303(2), 318(4); 3(5)" → ["303(2)", "318(4)", "3(5)"] */
export function splitSections(text: string): string[] {
  return text
    .split(/[,;\n]+|\s+and\s+|\s*&\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toEngineInput(v: TrackerFormValues): RightsClockInput {
  return {
    arrestDate: v.arrestDate,
    firstRemandDate: v.firstRemandDate || null,
    sections: splitSections(v.sectionsText),
    otherLawCharges: v.otherLawCharges,
    chargesheetFiledOn: v.chargesheetFiled && v.chargesheetFiledOn ? v.chargesheetFiledOn : null,
    priorConviction: v.priorConviction,
    otherPendingCases: v.otherPendingCases,
    inCustody: v.inCustody,
  };
}

export function toTrackerBody(v: TrackerFormValues) {
  return {
    ...toEngineInput(v),
    personName: v.personName,
    relationship: v.relationship || null,
    firNumber: v.firNumber || null,
    policeStation: v.policeStation || null,
    courtName: v.courtName || null,
    prisonName: v.prisonName || null,
    remindersEnabled: v.remindersEnabled,
  };
}

export function fromTracker(t: {
  personName: string;
  relationship: string | null;
  firNumber: string | null;
  policeStation: string | null;
  courtName: string | null;
  prisonName: string | null;
  remindersEnabled: boolean;
  input: RightsClockInput;
}): TrackerFormValues {
  return {
    personName: t.personName,
    relationship: t.relationship ?? "",
    arrestDate: t.input.arrestDate,
    firstRemandDate: t.input.firstRemandDate ?? "",
    sectionsText: t.input.sections.join(", "),
    otherLawCharges: t.input.otherLawCharges,
    chargesheetFiled: Boolean(t.input.chargesheetFiledOn),
    chargesheetFiledOn: t.input.chargesheetFiledOn ?? "",
    priorConviction: t.input.priorConviction,
    otherPendingCases: t.input.otherPendingCases,
    inCustody: t.input.inCustody,
    firNumber: t.firNumber ?? "",
    policeStation: t.policeStation ?? "",
    courtName: t.courtName ?? "",
    prisonName: t.prisonName ?? "",
    remindersEnabled: t.remindersEnabled,
  };
}

const inputCls =
  "w-full rounded-xl border border-borderCustom bg-card px-3 py-2.5 text-sm text-textPrimary outline-none transition-colors placeholder:text-textSecondary/60 focus:border-brandBlue focus:ring-2 focus:ring-brandBlue/20";

function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-textPrimary">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-textSecondary">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function TriChoice({
  name,
  value,
  onChange,
  labels = { YES: "Yes", NO: "No", UNKNOWN: "Don't know" },
}: {
  name: string;
  value: TriState;
  onChange: (v: TriState) => void;
  labels?: Record<TriState, string>;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {(["NO", "YES", "UNKNOWN"] as TriState[]).map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            value === opt
              ? "border-brandBlue bg-brandBlue text-white"
              : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary"
          )}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

export function TrackerForm({
  initial = EMPTY_FORM,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial?: TrackerFormValues;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (values: TrackerFormValues) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [v, setV] = useState<TrackerFormValues>(initial);
  const [preview, setPreview] = useState<RightsClockResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(Boolean(initial.firNumber || initial.policeStation || initial.courtName || initial.prisonName));
  const abortRef = useRef<AbortController | null>(null);
  const today = todayInIndia();

  const set = <K extends keyof TrackerFormValues>(key: K, value: TrackerFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const engineInput = useMemo(() => toEngineInput(v), [v]);
  const engineKey = JSON.stringify(engineInput);
  const canPreview = Boolean(v.arrestDate) && (engineInput.sections.length > 0 || v.otherLawCharges);

  useEffect(() => {
    if (!canPreview) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/rights-clock/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: engineKey,
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.success) {
          setPreview(json.data.result);
          setPreviewError(null);
        } else {
          setPreviewError(json.error?.message ?? "Could not calculate.");
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setPreviewError("Could not reach the server. Check your connection.");
      } finally {
        if (abortRef.current === controller) setPreviewLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [engineKey, canPreview]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(v);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-borderCustom bg-card p-5 sm:p-6" noValidate>
        <Field label="Name of the person in custody" required htmlFor={`${id}-name`}>
          <input
            id={`${id}-name`}
            className={inputCls}
            value={v.personName}
            onChange={(e) => set("personName", e.target.value)}
            maxLength={120}
            autoComplete="off"
            required
          />
        </Field>

        <Field label="Your relationship to them" hint="Used on the letter to the jail. Optional." htmlFor={`${id}-rel`}>
          <input
            id={`${id}-rel`}
            className={inputCls}
            value={v.relationship}
            onChange={(e) => set("relationship", e.target.value)}
            placeholder="e.g. Brother, Mother, Advocate"
            maxLength={60}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date of arrest" required htmlFor={`${id}-arrest`}>
            <input
              id={`${id}-arrest`}
              type="date"
              className={inputCls}
              value={v.arrestDate}
              max={today}
              onChange={(e) => set("arrestDate", e.target.value)}
              required
            />
          </Field>
          <Field label="First remand date" hint="From the remand order. Leave blank if unsure." htmlFor={`${id}-remand`}>
            <input
              id={`${id}-remand`}
              type="date"
              className={inputCls}
              value={v.firstRemandDate}
              min={v.arrestDate || undefined}
              max={today}
              onChange={(e) => set("firstRemandDate", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="BNS sections on the FIR"
          required
          hint="Copy them exactly, with sub-sections, separated by commas — e.g. 303(2), 318(4), 3(5)."
          htmlFor={`${id}-sections`}
        >
          <input
            id={`${id}-sections`}
            className={inputCls}
            value={v.sectionsText}
            onChange={(e) => set("sectionsText", e.target.value)}
            placeholder="303(2), 3(5)"
            autoComplete="off"
            inputMode="text"
          />
        </Field>

        <label className="flex items-start gap-2.5 text-sm text-textPrimary">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-borderCustom accent-brandBlue"
            checked={v.otherLawCharges}
            onChange={(e) => set("otherLawCharges", e.target.checked)}
          />
          <span>
            Also charged under another law
            <span className="block text-xs text-textSecondary">NDPS, UAPA, PMLA, Arms Act, POCSO, IT Act, etc.</span>
          </span>
        </label>

        <Field label="Has the police filed the chargesheet?">
          <div className="flex flex-wrap gap-1.5">
            {[
              { val: false, label: "Not yet / don't know" },
              { val: true, label: "Yes, filed on…" },
            ].map((o) => (
              <button
                key={String(o.val)}
                type="button"
                aria-pressed={v.chargesheetFiled === o.val}
                onClick={() => set("chargesheetFiled", o.val)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  v.chargesheetFiled === o.val
                    ? "border-brandBlue bg-brandBlue text-white"
                    : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {v.chargesheetFiled && (
            <input
              type="date"
              aria-label="Chargesheet filing date"
              className={cn(inputCls, "mt-2")}
              value={v.chargesheetFiledOn}
              max={today}
              onChange={(e) => set("chargesheetFiledOn", e.target.value)}
            />
          )}
        </Field>

        <Field label="Ever convicted of any offence before?" hint="A first-time offender can be released after one-third of the maximum sentence instead of one-half.">
          <TriChoice name="Prior conviction" value={v.priorConviction} onChange={(x) => set("priorConviction", x)} />
        </Field>

        <Field label="Any other case pending against them?">
          <TriChoice name="Other pending cases" value={v.otherPendingCases} onChange={(x) => set("otherPendingCases", x)} />
        </Field>

        <label className="flex items-center gap-2.5 text-sm text-textPrimary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-borderCustom accent-brandBlue"
            checked={v.inCustody}
            onChange={(e) => set("inCustody", e.target.checked)}
          />
          Still in custody today
        </label>

        <div className="border-t border-borderCustom pt-4">
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
            className="flex items-center gap-1.5 text-sm font-semibold text-textPrimary"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
            Case details for the application drafts
          </button>
          <p className="mt-0.5 text-xs text-textSecondary">Optional. Anything left out stays as a blank in the drafts.</p>
          {showMore && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["firNumber", "FIR number", "e.g. 0123/2026", 60],
                  ["policeStation", "Police station", "", 160],
                  ["courtName", "Court", "e.g. JMFC, Saket", 160],
                  ["prisonName", "Prison", "e.g. Central Jail No. 4, Tihar", 160],
                ] as const
              ).map(([key, label, ph, max]) => (
                <Field key={key} label={label} htmlFor={`${id}-${key}`}>
                  <input
                    id={`${id}-${key}`}
                    className={inputCls}
                    value={v[key]}
                    placeholder={ph}
                    maxLength={max}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-sm text-textPrimary">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-borderCustom accent-brandBlue"
            checked={v.remindersEnabled}
            onChange={(e) => set("remindersEnabled", e.target.checked)}
          />
          <span>
            Email me before each deadline
            <span className="block text-xs text-textSecondary">7 days before, the day before, and on the day.</span>
          </span>
        </label>

        {serverError && (
          <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting || !v.personName.trim() || !canPreview}
            className="flex items-center gap-2 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-borderCustom px-5 py-2.5 text-sm font-semibold text-textPrimary hover:bg-canvas"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite" className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold text-textPrimary">Live result</h2>
          {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-textSecondary" aria-label="Calculating" />}
        </div>
        {previewError && (
          <p className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">{previewError}</p>
        )}
        {preview ? (
          <RightsClockResultView result={preview} compact />
        ) : (
          <div className="rounded-2xl border border-dashed border-borderCustom bg-card p-8 text-center">
            <p className="text-sm font-medium text-textPrimary">Enter the arrest date and the sections</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-textSecondary">
              The dates appear here as you type. Nothing is saved until you press the button.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
