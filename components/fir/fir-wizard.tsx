"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <Card className="border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 shadow-sm transition-colors duration-200">
        <CardContent className="space-y-6 p-6">
          
          {/* Top Progress & Header */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/10 pb-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>
                Step {stepIndex + 1} of {STEP_COMPONENTS.length} — {WIZARD_STEP_LABELS[WIZARD_STEP_KEYS[stepIndex]]}
              </span>
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">Saving…</span>}
                <span className="text-slate-500 dark:text-slate-400">
                  {Math.round(((stepIndex + 1) / STEP_COMPONENTS.length) * 100)}%
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-in-out"
                style={{ width: `${((stepIndex + 1) / STEP_COMPONENTS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Active Step Component */}
          <div className="py-2">
            <StepComponent />
          </div>

          {/* Completeness Indicator */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/10 pt-4 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Completeness so far:{" "}
              <strong className="font-semibold text-slate-900 dark:text-slate-100">{liveCompleteness.score}%</strong>
            </span>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={goBack} 
              disabled={stepIndex === 0}
              className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Back
            </Button>
            
            {isLast ? (
              <Button 
                type="button"
                variant="default"
                onClick={onSubmit} 
                disabled={submitting}
                className="bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 shadow-sm transition-colors"
              >
                {submitting ? "Generating..." : "Generate FIR Draft"}
              </Button>
            ) : (
              <Button 
                type="button"
                variant="default"
                onClick={goNext}
                className="bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 shadow-sm transition-colors"
              >
                Next
              </Button>
            )}
          </div>

        </CardContent>
      </Card>
    </FormProvider>
  );
}