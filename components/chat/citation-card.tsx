"use client";

// ==========================================================
// LegalSetu — Citation card
// ----------------------------------------------------------
// This is the component that separates LegalSetu from a
// general-purpose chatbot. A general model states a section
// number and asks you to trust it. Here every citation shows:
//
//   - the act and section actually retrieved
//   - the official statutory text, verbatim, expandable
//   - a deep link to the same section on indiacode.gov.in
//   - how strongly it matched the question
//
// So the user never has to take the answer on faith — they can
// read the law themselves in one click.
// ==========================================================

import { useState } from "react";
import {
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface Citation {
  chunkId: string;
  sourceTitle: string;
  actName: string | null;
  section: string | null;
  officialUrl: string | null;
  verificationStatus: string;
  /** Official statutory text of this section. */
  text?: string;
  /** Cosine similarity to the question, 0-1. */
  similarity?: number;
}

export function CitationCard({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);
  const isVerified = citation.verificationStatus
    .toLowerCase()
    .includes("verified");

  const relevance =
    typeof citation.similarity === "number"
      ? Math.round(Math.max(0, Math.min(1, citation.similarity)) * 100)
      : null;

  // The stored text is prefixed "303. Theft" by the ingester; strip that
  // heading so the card's own header is not repeated inside the body.
  const body = (citation.text ?? "").replace(/^\s*\S+\.\s*[^\n]*\n+/, "").trim();

  return (
    <div className="group rounded-xl border border-borderCustom bg-card p-3.5 transition-colors hover:border-brandBlue/40">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brandBlue/20 bg-brandBlue/10 text-brandBlue">
          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-textPrimary">
            {citation.actName ?? citation.sourceTitle}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {citation.section && (
              <span className="rounded-md bg-brandBlue/10 px-1.5 py-0.5 font-mono font-semibold text-brandBlue">
                Section {citation.section}
              </span>
            )}

            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                isVerified
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-borderCustom bg-canvas text-textSecondary"
              )}
            >
              {isVerified ? (
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              ) : (
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
              )}
              {isVerified ? "Official source" : citation.verificationStatus}
            </span>

            {relevance !== null && (
              <span
                className="text-[10px] font-medium text-textSecondary"
                title="How closely this section matched the question"
              >
                {relevance}% match
              </span>
            )}
          </div>
        </div>

        {citation.officialUrl && (
          <a
            href={citation.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Read the official text of ${
              citation.actName ?? citation.sourceTitle
            } on India Code`}
            title="Read on indiacode.gov.in"
            className="shrink-0 rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-canvas hover:text-brandBlue focus:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* The actual statutory text — the whole point of the card. */}
      {body && (
        <div className="mt-2.5 border-t border-borderCustom pt-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-textSecondary transition-colors hover:text-textPrimary"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                open && "rotate-180"
              )}
            />
            {open ? "Hide" : "Read"} the exact law
          </button>

          {open && (
            <p
              // Statutory text is quoted verbatim and must never be
              // rewritten by the runtime translator.
              data-no-translate
              className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 text-xs leading-relaxed text-textPrimary"
            >
              {body}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
