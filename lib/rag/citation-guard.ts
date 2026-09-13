// ==========================================================
// LegalSetu — Citation Guard
// ----------------------------------------------------------
// Instructing a model not to invent citations reduces the
// problem; it does not solve it. Observed in testing: asked
// about phone snatching, the model answered with "Section 304
// of the BNS" even though no retrieved chunk contained "304".
// It was drawing on memory, not on the corpus.
//
// This module checks the finished answer against the text that
// was actually retrieved. Any statute reference that does not
// appear in the source material is reported as unverified, so
// the app can warn the user (and lower the evidence level)
// instead of presenting a remembered number as a sourced fact.
//
// Deliberately conservative: it only judges explicit statute
// references, never ordinary prose, so practical guidance is
// never flagged.
// ==========================================================

import type { RetrievedChunk } from "./types";

/**
 * Matches a statute reference and captures the whole number list that
 * follows, so "Sections 303 and 304" yields BOTH numbers rather than
 * only the first. Covers "Section 303", "Sections 303 and 304",
 * "Sec. 173", "u/s 420" and "BNS 304".
 */
const NUMBER_LIST = String.raw`(\d{1,3}[A-Z]?(?:\s*(?:,|and|&|/)\s*\d{1,3}[A-Z]?)*)`;

const CITATION_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:sections?|secs?\.?|u\/s)\s*` + NUMBER_LIST, "gi"),
  new RegExp(String.raw`\b(?:BNS|BNSS|IPC|CrPC|CPC)\s*[-–]?\s*` + NUMBER_LIST, "gi"),
];

export interface CitationAudit {
  /** Section numbers present in both the answer and the retrieved text. */
  verified: string[];
  /** Section numbers the answer asserts but the sources do not support. */
  unverified: string[];
  /** True when the answer cites nothing at all. */
  hasNoCitations: boolean;
}

/** Collects every distinct statute number referenced in the answer. */
export function extractCitedSections(answer: string): string[] {
  const found = new Set<string>();

  for (const pattern of CITATION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(answer)) !== null) {
      if (!match[1]) continue;
      // The capture may be a list ("303 and 304") — record each number.
      for (const part of match[1].split(/\s*(?:,|and|&|\/)\s*/i)) {
        const number = part.trim().toUpperCase();
        if (number) found.add(number);
      }
    }
  }

  return Array.from(found);
}

/**
 * Checks each cited section against the retrieved material.
 * A citation counts as supported if the number appears in a
 * chunk's own `section` metadata or anywhere in its text.
 */
export function auditCitations(
  answer: string,
  chunks: RetrievedChunk[]
): CitationAudit {
  const cited = extractCitedSections(answer);
  if (cited.length === 0) {
    return { verified: [], unverified: [], hasNoCitations: true };
  }

  const corpus = chunks.map((c) => c.text).join(" \n ");
  const declared = new Set(
    chunks
      .map((c) => c.section?.toUpperCase())
      .filter((s): s is string => Boolean(s))
  );

  const verified: string[] = [];
  const unverified: string[] = [];

  for (const section of cited) {
    const inMetadata = declared.has(section);
    // Word-boundary match so "304" does not match "3040" or "1304".
    const inText = new RegExp(`\\b${section}\\b`).test(corpus);

    if (inMetadata || inText) verified.push(section);
    else unverified.push(section);
  }

  return { verified, unverified, hasNoCitations: false };
}

/**
 * Evidence must never look stronger than the citations justify.
 * An answer resting on numbers the corpus cannot support is
 * downgraded, so the badge the user sees matches reality.
 */
export function adjustEvidenceLevel(
  level: string,
  audit: CitationAudit
): string {
  if (audit.unverified.length === 0) return level;

  // Every citation unsupported — treat as ungrounded.
  if (audit.verified.length === 0) return "LIMITED";

  // Mixed: step down one level.
  if (level === "STRONG") return "MODERATE";
  if (level === "MODERATE") return "LIMITED";
  return level;
}

/**
 * User-facing explanation of what could not be verified.
 * Returns null when there is nothing to warn about.
 */
export function buildCitationWarning(audit: CitationAudit): string | null {
  if (audit.unverified.length === 0) return null;

  const list = audit.unverified
    .map((s) => `Section ${s}`)
    .join(", ");

  return `${list} could not be matched against LegalSetu's verified source library. Treat ${
    audit.unverified.length === 1 ? "it" : "them"
  } as unconfirmed and check with a lawyer or the official bare act before relying on ${
    audit.unverified.length === 1 ? "it" : "them"
  }.`;
}
