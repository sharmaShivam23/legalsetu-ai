"use client";

// ==========================================================
// LegalSetu — Chat empty state
// ----------------------------------------------------------
// Two jobs, both about trust and orientation:
//
//  1. Show what the assistant can actually answer from, by
//     naming the real acts in the library with section counts
//     pulled live from the database. Not a marketing claim —
//     it is the same corpus the retriever searches.
//
//  2. Give a first-time user, who may never have dealt with
//     the legal system, concrete ways to start. A blank box is
//     intimidating when you are frightened and need help now.
// ==========================================================

import { useEffect, useState } from "react";
import { Scale, Library, ExternalLink, ArrowUpRight } from "lucide-react";

interface CorpusAct {
  id: string;
  title: string;
  officialUrl: string | null;
  sectionCount: number;
}

interface Corpus {
  acts: CorpusAct[];
  actCount: number;
  searchableSections: number;
  provenance: string;
}

/** Everyday situations, in the words someone would actually use. */
const EXAMPLES = [
  "My phone was snatched on the street. What do I do?",
  "My landlord is refusing to return my deposit.",
  "I bought a defective product and the seller won't refund me.",
  "Someone is threatening me online for money.",
];

export function ChatEmptyState({
  onPick,
}: {
  onPick: (question: string) => void;
}) {
  const [corpus, setCorpus] = useState<Corpus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rag/corpus")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.data) setCorpus(j.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto mt-2 w-full max-w-2xl pb-4">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-borderCustom bg-card shadow-sm">
          <Scale className="h-8 w-8 text-brandBlue" strokeWidth={1.5} />
        </div>

        <h2 className="mt-4 font-serif text-3xl font-light tracking-wide text-textPrimary">
          How can I help you today?
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-textSecondary">
          Describe your situation in your own words, in any of 16 languages.
          Every answer is built from official Indian legislation and shows you
          the exact sections it used.
        </p>
      </div>

      {/* Concrete starting points. */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group flex items-start justify-between gap-2 rounded-xl border border-borderCustom bg-card p-3.5 text-left text-sm text-textPrimary transition-colors hover:border-brandBlue/40 hover:bg-canvas"
          >
            <span className="leading-snug">{q}</span>
            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-textSecondary transition-colors group-hover:text-brandBlue" />
          </button>
        ))}
      </div>

      {/* The library itself — the answer to "where is this data from?". */}
      {corpus && corpus.acts.length > 0 && (
        <div className="mt-6 rounded-xl border border-borderCustom bg-card p-4">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-semibold text-textPrimary">
              Searching {corpus.searchableSections.toLocaleString()} sections
              across {corpus.actCount} Acts
            </p>
          </div>

          <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" data-no-translate>
            {corpus.acts.map((act) =>
              act.officialUrl ? (
                <a
                  key={act.id}
                  href={act.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${act.title} — ${act.sectionCount} sections. Open on India Code.`}
                  className="inline-flex items-center gap-1 rounded-lg border border-borderCustom bg-canvas px-2 py-1 text-[11px] text-textSecondary transition-colors hover:border-brandBlue/40 hover:text-brandBlue"
                >
                  {act.title}
                  <span className="font-mono opacity-60">
                    {act.sectionCount}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span
                  key={act.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-borderCustom bg-canvas px-2 py-1 text-[11px] text-textSecondary"
                >
                  {act.title}
                  <span className="font-mono opacity-60">
                    {act.sectionCount}
                  </span>
                </span>
              )
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-textSecondary">
            Source: {corpus.provenance}. LegalSetu answers only from these
            texts, and flags any citation it cannot trace back to them.
          </p>
        </div>
      )}
    </div>
  );
}
