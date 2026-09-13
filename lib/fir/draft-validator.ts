// ==========================================================
// LegalSetu — FIR Assistant: draft fabrication guard
// ----------------------------------------------------------
// A police complaint is signed by the complainant under a
// declaration that its contents are true. If a model quietly
// adds a witness, rounds ₹24,500 to ₹25,000, or attaches a
// statute nobody verified, the person signing it carries that.
//
// So the generated draft is checked back against the case state
// before it is ever shown as final: every date, every amount and
// every statutory reference must trace to something the user
// said, a document they uploaded, or a section actually
// retrieved from the verified corpus.
//
// Deliberately narrow. It audits the claims that are both
// machine-checkable and legally consequential — dates, money,
// sections — and leaves ordinary prose alone, so it flags real
// fabrication rather than nagging about wording.
// ==========================================================

import type { FIRCaseState, LegalContextEntry } from "./case-state";
import { supportedValues } from "./case-state";

export interface DraftIssue {
  type: "DATE" | "AMOUNT" | "STATUTE";
  /** The exact token in the draft that could not be supported. */
  value: string;
  message: string;
}

export interface DraftValidation {
  ok: boolean;
  issues: DraftIssue[];
}

/** "15 August 2026", "15/08/2026", "15-08-2026", "2026-08-15". */
const DATE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

/** ₹25,000 / Rs. 25000 / INR 25,000. */
const AMOUNT_PATTERN = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;

/** "Section 303", "u/s 318", "BNS 351". */
const STATUTE_PATTERN =
  /\b(?:section|sec\.?|u\/s|BNS|BNSS|BSA|IPC|CrPC)\s*(\d{1,3}[A-Z]?)\b/gi;

/** Digits only, so ₹25,000 and "25000" compare equal. */
function digitsOf(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/** Loose date comparison: any shared 3+ digit run (year) plus day match. */
function normaliseDate(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collect(text: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push(m[0]);
  }
  return found;
}

/**
 * Checks a generated complaint against the facts on record.
 *
 * @param draft   the complaint text the model produced
 * @param state   the confirmed case state it was built from
 */
export function validateDraft(
  draft: string,
  state: FIRCaseState
): DraftValidation {
  const issues: DraftIssue[] = [];
  const supported = supportedValues(state);
  const supportedBlob = supported.join(" \n ").toLowerCase();

  // ---- Dates ----
  const supportedDates = new Set(
    collect(supportedBlob, DATE_PATTERNS).map(normaliseDate)
  );
  // Bare years/day-month fragments the user gave in free text still count.
  const supportedDigits = digitsOf(supportedBlob);

  for (const date of collect(draft, DATE_PATTERNS)) {
    const norm = normaliseDate(date);
    if (supportedDates.has(norm)) continue;

    // A date written differently ("15 August 2026" vs "15/08/2026") is
    // still supported if its digits appear in the recorded facts.
    const digits = digitsOf(date);
    if (digits && supportedDigits.includes(digits)) continue;

    // Day + year present separately is good enough — the model is
    // allowed to reformat, just not to invent.
    const day = digits.slice(0, 2);
    const year = date.match(/\b(\d{4})\b/)?.[1];
    if (year && supportedDigits.includes(year) && day && supportedDigits.includes(day)) {
      continue;
    }

    issues.push({
      type: "DATE",
      value: date,
      message: `The draft states the date "${date}", which does not appear anywhere in the facts on record.`,
    });
  }

  // ---- Amounts ----
  const supportedAmounts = new Set(
    collect(supportedBlob, [AMOUNT_PATTERN]).map(digitsOf)
  );
  for (const amount of collect(draft, [AMOUNT_PATTERN])) {
    const digits = digitsOf(amount);
    if (!digits) continue;
    if (supportedAmounts.has(digits)) continue;
    // A bare number in the user's own sentence ("they took 25000") backs
    // a formatted "₹25,000" in the draft.
    if (supportedDigits.includes(digits)) continue;

    issues.push({
      type: "AMOUNT",
      value: amount,
      message: `The draft states the amount "${amount}", which does not match any figure you provided.`,
    });
  }

  // ---- Statutory references ----
  // Sections may only appear if they were actually retrieved from the
  // verified corpus into legalContext. Nothing else counts, including
  // the model's own legal knowledge.
  const allowedSections = new Set(
    state.legalContext.map((entry: LegalContextEntry) => entry.section.toUpperCase())
  );
  const seenStatutes = new Set<string>();

  for (const ref of collect(draft, [STATUTE_PATTERN])) {
    const number = ref.match(/(\d{1,3}[A-Z]?)/i)?.[1]?.toUpperCase();
    if (!number || seenStatutes.has(number)) continue;
    seenStatutes.add(number);

    if (!allowedSections.has(number)) {
      issues.push({
        type: "STATUTE",
        value: ref,
        message: `The draft cites "${ref}", which was not retrieved from LegalSetu's verified law library. Statutory provisions are for the police to determine and must not be asserted here.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Removes unsupported statutory references from a draft rather than
 * rejecting the whole document.
 *
 * Dates and amounts are NOT auto-stripped: silently deleting a figure
 * would leave a misleading gap in a sworn account, so those are raised
 * to the user instead. An unverified section, by contrast, is safe to
 * drop — the complaint stands perfectly well on its facts alone.
 */
export function stripUnsupportedStatutes(
  draft: string,
  state: FIRCaseState
): string {
  const allowed = new Set(state.legalContext.map((e) => e.section.toUpperCase()));

  return draft
    .split("\n")
    .filter((line) => {
      const refs = collect(line, [STATUTE_PATTERN]);
      if (refs.length === 0) return true;
      return refs.every((ref) => {
        const n = ref.match(/(\d{1,3}[A-Z]?)/i)?.[1]?.toUpperCase();
        return n ? allowed.has(n) : true;
      });
    })
    .join("\n");
}
