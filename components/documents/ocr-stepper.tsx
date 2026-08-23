// components/documents/ocr-stepper.tsx
//
// Visual pipeline indicator for the Document OCR flow. Shows every stage
// (Upload → Extract Text → AI Upload → AI Analysis) with its current
// status, so the user always knows what's running and what's next instead
// of staring at a bare "Analyzing your document…" line.
//
// Horizontal layout only, at every screen width — no separate mobile
// variant. On narrow screens the row shrinks (icons/gaps scale down and
// labels wrap) rather than switching to a second, differently-laid-out
// stepper, which was causing both versions to render at once if the
// responsive utility classes weren't in the compiled Tailwind output.

import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type StepStatus = "complete" | "active" | "pending" | "error";

export interface OcrStep {
  label: string;
  description?: string;
  status: StepStatus;
}

interface OcrStepperProps {
  steps: OcrStep[];
  className?: string;
}

export function OcrStepper({ steps, className }: OcrStepperProps) {
  return (
    <div
      className={cn(
        "mb-8 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm sm:p-6",
        className
      )}
    >
      <ol className="flex items-start">
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center px-1" style={{ minWidth: 72 }}>
              <StepIcon status={step.status} />
              <p
                className={cn(
                  "mt-2 text-center text-[11px] font-semibold leading-tight sm:text-sm",
                  step.status === "active" && "text-sky-700",
                  step.status === "complete" && "text-slate-700",
                  step.status === "pending" && "text-slate-400",
                  step.status === "error" && "text-red-600"
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="mt-0.5 hidden text-center text-xs text-slate-400 sm:block">
                  {step.description}
                </p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mt-4 h-0.5 flex-1 rounded-full transition-colors duration-500",
                  steps[i].status === "complete" ? "bg-sky-400" : "bg-sky-100"
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const base =
    "flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300";

  if (status === "complete") {
    return (
      <div className={cn(base, "border-sky-500 bg-sky-500 text-white shadow-sm shadow-sky-200")}>
        <Check className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={3} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div
        className={cn(
          base,
          "border-sky-500 bg-white text-sky-600 shadow-sm shadow-sky-200 ring-4 ring-sky-100"
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin sm:h-4.5 sm:w-4.5" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={cn(base, "border-red-400 bg-red-50 text-red-500")}>
        <AlertCircle className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.5} />
      </div>
    );
  }
  // pending
  return (
    <div className={cn(base, "border-slate-200 bg-white text-slate-300")}>
      <span className="h-2 w-2 rounded-full bg-slate-300" />
    </div>
  );
}
