"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Tags,
  Clock,
  MapPin,
  UserSearch,
  Coins,
  FileText,
  Users,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
} from "lucide-react";
import { firWizardDataSchema, type FirWizardDataInput } from "@/lib/validation/fir-wizard-schema";
import { WIZARD_STEP_KEYS, WIZARD_STEP_LABELS } from "@/lib/fir/types";
import type { FIRWizardData } from "@/lib/fir/types";
import { computeCompleteness } from "@/lib/fir/completeness";
import {
  StepIncidentType,
  StepDateTime,
  StepLocation,
  StepAccused,
  StepLossHarm,
  StepNarrative,
  StepWitnesses,
  StepReview,
} from "./wizard-steps";
import { FirDraftPreview } from "./fir-draft-preview";

const STEP_COMPONENTS = [
  StepIncidentType,
  StepDateTime,
  StepLocation,
  StepAccused,
  StepLossHarm,
  StepNarrative,
  StepWitnesses,
  StepReview,
];

/** One icon per step, in the same order as WIZARD_STEP_KEYS — this is
 *  what turns a thin progress bar into something a person can scan at
 *  a glance and see exactly how far through the intake they are. */
const STEP_ICONS = [Tags, Clock, MapPin, UserSearch, Coins, FileText, Users, CheckCircle2];

interface FIRWizardProps {
  caseId?: string;
}

export function FIRWizard({ caseId }: FIRWizardProps) {
  const { data: session } = useSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const creatingRef = useRef(false);

  const methods = useForm<FirWizardDataInput>({
    resolver: zodResolver(firWizardDataSchema.partial()),
    defaultValues: {},
    mode: "onBlur",
  });

  const { watch, handleSubmit, getValues } = methods;
  const formData = watch();

  // Create the draft record on first mount so progress can be autosaved.
  useEffect(() => {
    if (draftId || creatingRef.current) return;
    creatingRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/fir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId, formData: {} }),
        });
        const json = await res.json();
        if (json.success) setDraftId(json.data.draft.id);
      } catch {
        // Non-fatal — user can still fill the form; save happens on submit.
      }
    })();
  }, [draftId, caseId]);

  async function persistProgress(values: FirWizardDataInput) {
    if (!draftId) return;
    setSaving(true);
    try {
      await fetch(`/api/fir/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: values }),
      });
    } catch {
      // Autosave failures are silent — data still lives in form state.
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    await persistProgress(getValues());
    setStepIndex((s) => Math.min(STEP_COMPONENTS.length - 1, s + 1));
  }

  function goBack() {
    setStepIndex((s) => Math.max(0, s - 1));
  }

  function goToStep(index: number) {
    // Only allow jumping to a step already reached — this is a guided
    // intake, not a form the user should be able to skip ahead in.
    if (index <= stepIndex) setStepIndex(index);
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await persistProgress(values);
      if (draftId) {
        const res = await fetch("/api/fir/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firDraftId: draftId }),
        });
        const json = await res.json();
        if (!json.success) {
          toast.error(json.error?.message ?? "Could not validate draft.");
        }
      }
      setFinalized(true);
    } finally {
      setSubmitting(false);
    }
  });

  if (finalized) {
    const completeness = computeCompleteness(formData as FIRWizardData);
    return (
      <FirDraftPreview
        data={formData as FIRWizardData}
        completeness={completeness}
        applicantName={session?.user?.name ?? undefined}
      />
    );
  }

  const StepComponent = STEP_COMPONENTS[stepIndex];
  const isLast = stepIndex === STEP_COMPONENTS.length - 1;
  const liveCompleteness = computeCompleteness(formData as FIRWizardData);

  return (
    <FormProvider {...methods}>
      {/* Icon stepper — one glance shows exactly where you are and how
          much is left, rather than a bare percentage. */}
      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1">
          {WIZARD_STEP_KEYS.map((key, i) => {
            const Icon = STEP_ICONS[i];
            const done = i < stepIndex;
            const active = i === stepIndex;
            const reachable = i <= stepIndex;
            return (
              <div key={key} className="flex items-center">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!reachable}
                  title={WIZARD_STEP_LABELS[key]}
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all " +
                    (done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : active
                        ? "border-brandBlue bg-brandBlue text-white shadow-md shadow-brandBlue/25"
                        : "border-borderCustom bg-card text-textSecondary") +
                    (reachable && !active ? " cursor-pointer hover:border-brandBlue/50" : "")
                  }
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </button>
                {i < WIZARD_STEP_KEYS.length - 1 && (
                  <div
                    className={
                      "h-0.5 w-6 shrink-0 transition-colors sm:w-10 " +
                      (i < stepIndex ? "bg-emerald-500" : "bg-borderCustom")
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-borderCustom bg-card shadow-sm">
        <div className="space-y-6 p-5 sm:p-7">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-borderCustom pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brandBlue">
                Step {stepIndex + 1} of {STEP_COMPONENTS.length}
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-textPrimary">
                {WIZARD_STEP_LABELS[WIZARD_STEP_KEYS[stepIndex]]}
              </h2>
            </div>
            {saving && (
              <span className="flex items-center gap-1.5 text-[11px] text-textSecondary">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Saving…
              </span>
            )}
          </div>

          {/* Active Step Component */}
          <div key={stepIndex} className="fir-step-enter">
            <StepComponent />
          </div>

          {/* Completeness Indicator */}
          <div className="flex items-center gap-3 rounded-xl border border-borderCustom bg-canvas px-3.5 py-2.5">
            <span className="text-[11px] font-medium text-textSecondary">Draft completeness</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-borderCustom">
              <div
                className="h-full rounded-full bg-brandBlue transition-all duration-500"
                style={{ width: `${liveCompleteness.score}%` }}
              />
            </div>
            <span className="text-xs font-bold text-textPrimary">{liveCompleteness.score}%</span>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-4 py-2.5 text-sm font-medium text-textPrimary transition-colors hover:bg-canvas disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Generating…" : "Generate FIR draft"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1.5 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fir-step-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fir-step-enter {
          animation: fir-step-in 0.22s ease-out;
        }
      `}</style>
    </FormProvider>
  );
}
