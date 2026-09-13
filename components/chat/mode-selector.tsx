"use client";

// ==========================================================
// LegalSetu — Chat mode selector
// ----------------------------------------------------------
// Three distinct ways to talk to LegalSetu, each a genuinely
// different conversation shape rather than a cosmetic label:
//
//  case      Flagship. The assistant interviews the user first,
//            then produces a full report with a flowchart.
//  quick     One question, one grounded answer, right away.
//  knowledge An explainer for a concept, Act, or right — not
//            tied to the user's own situation.
// ==========================================================

import { Stethoscope, Zap, Landmark, FileText } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ChatMode } from "@/lib/rag/prompt";

const MODES: {
  id: ChatMode;
  label: string;
  hint: string;
  Icon: typeof Stethoscope;
}[] = [
  {
    id: "case",
    label: "Case Analysis",
    hint: "Answers a few questions about your situation, then gives a full plan with a flowchart.",
    Icon: Stethoscope,
  },
  {
    id: "quick",
    label: "Quick Answer",
    hint: "Skips the questions — one grounded answer right away.",
    Icon: Zap,
  },
  {
    id: "knowledge",
    label: "Know the Law",
    hint: "Ask about any Act, right, or legal concept — for learning, not a specific case.",
    Icon: Landmark,
  },
  {
    id: "fir",
    label: "Generate FIR",
    hint: "Answer a few questions and get a police complaint / FIR draft you can download as a PDF.",
    Icon: FileText,
  },
];

export function ModeSelector({
  mode,
  onChange,
  disabled,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Chat mode"
      className="flex items-center gap-1 rounded-2xl border border-borderCustom bg-card/90 p-1 shadow-sm backdrop-blur-xl"
    >
      {MODES.map(({ id, label, hint, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={hint}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:px-3",
              active
                ? "bg-brandBlue text-white shadow-sm"
                : "text-textSecondary hover:bg-canvas hover:text-textPrimary"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
