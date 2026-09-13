"use client";

// ==========================================================
// LegalSetu — Answer Trust Panel
// ----------------------------------------------------------
// The feature that distinguishes this from a general chatbot.
//
// A general model asserts "Section 303 of the BNS" and you have
// no way to know whether it read that or remembered it. Here,
// after the answer is generated, every statute number it cites
// is checked back against the text actually retrieved from the
// official corpus (lib/rag/citation-guard.ts).
//
// This panel reports that check honestly in both directions:
//   - green  : every citation traced to a retrieved source
//   - amber  : the model cited something the sources don't support
//   - grey   : no statute cited (practical guidance only)
//
// The amber state is the important one. It is the app admitting
// it caught its own model inventing a citation — the opposite of
// what an unverified assistant does, which is state it calmly.
// ==========================================================

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Info,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface TrustPanelProps {
  /** Section numbers traced back to retrieved official text. */
  verified?: string[];
  /** Section numbers the corpus could not support. */
  unverified?: string[];
  /** Human-readable caution copy from the citation guard. */
  warning?: string | null;
  /** How many source passages were retrieved for this answer. */
  sourceCount?: number;
  /** Names of the acts searched, for the transparency line. */
  actsSearched?: string[];
}

export function AnswerTrustPanel({
  verified = [],
  unverified = [],
  warning,
  sourceCount = 0,
  actsSearched = [],
}: TrustPanelProps) {
  const [open, setOpen] = useState(false);

  const total = verified.length + unverified.length;
  const hasProblem = unverified.length > 0;
  const citedNothing = total === 0;

  // Nothing meaningful to report — no sources and no citations.
  if (citedNothing && sourceCount === 0) return null;

  const tone = hasProblem
    ? {
        ring: "border-amber-500/40 bg-amber-500/5",
        text: "text-amber-700 dark:text-amber-400",
        Icon: ShieldAlert,
      }
    : citedNothing
      ? {
          ring: "border-borderCustom bg-canvas",
          text: "text-textSecondary",
          Icon: Info,
        }
      : {
          ring: "border-emerald-500/40 bg-emerald-500/5",
          text: "text-emerald-700 dark:text-emerald-400",
          Icon: ShieldCheck,
        };

  const headline = hasProblem
    ? `${unverified.length} citation${unverified.length === 1 ? "" : "s"} could not be verified`
    : citedNothing
      ? "Practical guidance — no statute cited"
      : `${verified.length} of ${total} citation${total === 1 ? "" : "s"} verified against official sources`;

  return (
    <div className={cn("mt-5 rounded-xl border p-3", tone.ring)}>
      <div className="flex items-start gap-2.5">
        <tone.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.text)} />

        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-semibold", tone.text)}>{headline}</p>

          {/* The verified numbers themselves, so the claim is checkable. */}
          {verified.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1" data-no-translate>
              {verified.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  ✓ Section {s}
                </span>
              ))}
            </div>
          )}

          {unverified.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1" data-no-translate>
              {unverified.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                >
                  ? Section {s}
                </span>
              ))}
            </div>
          )}

          {warning && (
            <p className="mt-2 text-[11px] leading-relaxed text-textPrimary">
              {warning}
            </p>
          )}

          {/* Retrieval transparency — what the search actually looked at. */}
          {sourceCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-textSecondary transition-colors hover:text-textPrimary"
              >
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
                />
                How this answer was grounded
              </button>

              {open && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-canvas p-2.5 text-[11px] leading-relaxed text-textSecondary">
                  <p className="flex items-start gap-1.5">
                    <Search className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      Searched LegalSetu&apos;s verified library and read the{" "}
                      <strong className="text-textPrimary">
                        {sourceCount} closest section{sourceCount === 1 ? "" : "s"}
                      </strong>{" "}
                      before answering.
                    </span>
                  </p>

                  {actsSearched.length > 0 && (
                    <p data-no-translate className="pl-4.5">
                      Sources drawn from: {actsSearched.join(", ")}.
                    </p>
                  )}

                  <p className="pl-4.5">
                    Every statute number in the answer was then checked back
                    against that retrieved text. Anything not found there is
                    flagged above rather than presented as fact.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
