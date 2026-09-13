"use client";

// ==========================================================
// LegalSetu — FIR Assistant: live case panel
// ----------------------------------------------------------
// Shows the record as it is being built. Someone describing a
// distressing incident should be able to see exactly what has
// been written down about them, and correct it, rather than
// finding out at the end.
//
// Each fact shows where it came from, because a value the
// complainant stated and one lifted from an uploaded document
// carry different weight on a document they will sign.
// ==========================================================

import { ClipboardList, User, FileSearch, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { FIRCaseState, FactKey, FactSource } from "@/lib/fir/case-state";

/** Plain-language labels — no "accused particulars" or "occurrence". */
const LABELS: Partial<Record<FactKey, string>> = {
  incidentType: "What kind of incident",
  incidentDate: "When",
  incidentTime: "Time",
  incidentLocation: "Where",
  jurisdictionArea: "Area / city",
  whatHappened: "What happened",
  complainantName: "Your name",
  complainantContact: "Your contact",
  complainantAddress: "Your address",
  victimName: "Affected person",
  victimRelationship: "Your relationship",
  accusedKnown: "Person known?",
  accusedName: "Person involved",
  accusedDescription: "Description",
  propertyInvolved: "What was affected",
  financialLoss: "Amount involved",
  injuries: "Injuries",
  threats: "Threats",
  witnesses: "Witnesses",
  evidence: "Evidence you have",
  actionsAlreadyTaken: "Steps already taken",
  policeContact: "Police contacted",
  previousComplaint: "Previous complaint",
  requestedAction: "What you want",
};

const SOURCE_META: Record<FactSource, { label: string; Icon: typeof User; tone: string }> = {
  USER: { label: "You told us", Icon: User, tone: "text-emerald-600 dark:text-emerald-400" },
  DOCUMENT: { label: "From your document", Icon: FileSearch, tone: "text-blue-600 dark:text-blue-400" },
  AI_INFERRED: { label: "Understood from your account", Icon: Sparkles, tone: "text-amber-600 dark:text-amber-400" },
};

export function CasePanel({ state }: { state: FIRCaseState | null }) {
  const facts = state?.facts ?? [];

  return (
    <aside className="lg:sticky lg:top-4 lg:h-fit">
      <div className="rounded-2xl border border-borderCustom bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-borderCustom pb-3">
          <ClipboardList className="h-4 w-4 text-brandBlue" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-textSecondary">
            Case details so far
          </h3>
        </div>

        {facts.length === 0 ? (
          <p className="py-6 text-center text-xs leading-relaxed text-textSecondary">
            As you describe what happened, the details will appear here so you
            can check them.
          </p>
        ) : (
          <dl className="mt-3 space-y-3">
            {facts.map((fact) => {
              const meta = SOURCE_META[fact.source];
              return (
                <div key={`${fact.key}-${fact.source}`}>
                  <dt className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-textSecondary">
                    <span>{LABELS[fact.key] ?? fact.key}</span>
                    <span
                      title={meta.label}
                      className={cn("flex items-center gap-1 font-normal normal-case", meta.tone)}
                    >
                      <meta.Icon className="h-3 w-3" />
                    </span>
                  </dt>
                  <dd
                    className="mt-0.5 break-words text-sm text-textPrimary"
                    data-no-translate
                  >
                    {fact.value}
                    {fact.confidence === "UNCERTAIN" && (
                      <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                        (to confirm)
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        {state && state.timeline.length > 0 && (
          <div className="mt-4 border-t border-borderCustom pt-3">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-textSecondary">
              Timeline
            </h4>
            <ol className="mt-2 space-y-1.5">
              {state.timeline.map((event, i) => (
                <li key={i} className="text-xs text-textPrimary" data-no-translate>
                  <span className="font-semibold">{event.date}</span>
                  {event.time ? ` ${event.time}` : ""} — {event.description}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </aside>
  );
}
