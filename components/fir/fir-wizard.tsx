"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { key: "incidentType", label: "Incident type", placeholder: "e.g. Theft, Land dispute, Fraud" },
  { key: "incidentDate", label: "Date/time of incident", type: "datetime-local" },
  { key: "location", label: "Location", placeholder: "Where did this happen?" },
  { key: "peopleInvolved", label: "People involved", placeholder: "Names, relationships if known" },
  { key: "description", label: "What happened?", textarea: true },
  { key: "evidence", label: "Evidence you have", textarea: true },
  { key: "witnesses", label: "Witnesses", placeholder: "Names/contact if available" },
  { key: "additionalDetails", label: "Additional details", textarea: true },
] as const;

type FormState = Record<string, string>;

export function FIRWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [validation, setValidation] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function updateField(value: string) {
    setForm((f) => ({ ...f, [current.key]: value }));
  }

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (payload.incidentDate) {
        payload.incidentDate = new Date(payload.incidentDate).toISOString();
      }
      const res = await fetch("/api/fir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message ?? "Could not generate draft.");
        return;
      }
      setDraftId(data.data.draft.id);

      const validateRes = await fetch("/api/fir/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firDraftId: data.data.draft.id }),
      });
      const validateData = await validateRes.json();
      if (validateData.success) setValidation(validateData.data.validation);
    } finally {
      setSubmitting(false);
    }
  }

  if (draftId && validation) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <Badge variant="warning">Draft / Assistance Document</Badge>
          <h2 className="text-lg font-semibold text-navy-900">FIR Draft Summary</h2>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p><strong>Completeness:</strong> {validation.completenessScore}%</p>
          </div>

          {validation.missingFields.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Missing information:</p>
                <ul className="mt-1 list-disc pl-4">
                  {validation.missingFields.map((f: string) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {validation.missingFields.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              All required fields are complete.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            <p className="mb-2 font-medium text-navy-900">Draft contents</p>
            {Object.entries(form).map(([k, v]) =>
              v ? (
                <p key={k} className="mb-1">
                  <span className="font-medium capitalize">{k}: </span>
                  {v}
                </p>
              ) : null
            )}
          </div>

          <p className="text-xs text-slate-400">
            This is a draft assistance document, not an officially filed FIR.
            Please review it with the appropriate police station or legal aid
            service before submission.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">
            Step {step + 1} of {STEPS.length}
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-navy-900">
            {current.label}
          </label>
          {"textarea" in current && current.textarea ? (
            <Textarea
              value={form[current.key] ?? ""}
              onChange={(e) => updateField(e.target.value)}
              rows={4}
            />
          ) : (
            <Input
              type={"type" in current ? current.type : "text"}
              placeholder={"placeholder" in current ? current.placeholder : ""}
              value={form[current.key] ?? ""}
              onChange={(e) => updateField(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {isLast ? (
            <Button variant="brand" onClick={handleGenerate} disabled={submitting}>
              {submitting ? "Generating..." : "Generate FIR Draft"}
            </Button>
          ) : (
            <Button variant="brand" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
