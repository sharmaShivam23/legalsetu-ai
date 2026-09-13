// ==========================================================
// LegalSetu — FIR Assistant: contradiction detection
// ----------------------------------------------------------
// When an uploaded bank statement says 14 August and the user
// said 15 August, the wrong move is to pick one. A complaint is
// the complainant's sworn account, so only they can say which is
// right — and a date that is off by a day can be the difference
// between a statement that holds up and one that does not.
//
// So conflicts are surfaced, not resolved. Anything that
// materially changes the complaint (dates, money, identities,
// place) BLOCKS draft generation until the user chooses.
// ==========================================================

import type { CaseFact, Contradiction, FactKey, FIRCaseState } from "./case-state";

/**
 * Facts where a mismatch changes the substance of the complaint.
 * A differing description of a suspect is worth flagging but not
 * worth blocking on; a differing date or amount is.
 */
const BLOCKING_KEYS: FactKey[] = [
  "incidentDate",
  "incidentTime",
  "incidentLocation",
  "financialLoss",
  "accusedName",
  "complainantName",
  "victimName",
];

/** Digits only — so "₹25,000" and "25000" are recognised as the same. */
function digits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when two recorded values are meaningfully different, as opposed
 * to the same fact written another way. "15/08/2026" and "15 August
 * 2026" are the same date; flagging that as a conflict would train the
 * user to click through warnings, which is worse than not warning.
 */
export function valuesConflict(a: string, b: string): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  if (na === nb) return false;

  // One phrasing containing the other is elaboration, not conflict
  // ("Delhi" vs "near my house in Delhi").
  if (na.includes(nb) || nb.includes(na)) return false;

  // Numeric values: compare the numbers themselves.
  const da = digits(a);
  const db = digits(b);
  if (da && db) return da !== db;

  return true;
}

/**
 * Compares every source's version of each fact and returns the
 * disagreements. Facts from the same source never conflict with
 * themselves — upsertFact already keeps only the latest per source.
 */
export function detectContradictions(facts: CaseFact[]): Contradiction[] {
  const byKey = new Map<FactKey, CaseFact[]>();
  for (const fact of facts) {
    if (!fact.value?.trim()) continue;
    byKey.set(fact.key, [...(byKey.get(fact.key) ?? []), fact]);
  }

  const contradictions: Contradiction[] = [];

  for (const [key, entries] of byKey) {
    if (entries.length < 2) continue;

    // Any pair that genuinely disagrees makes this slot contested.
    const conflicting = entries.some((a, i) =>
      entries.slice(i + 1).some((b) => valuesConflict(a.value, b.value))
    );
    if (!conflicting) continue;

    contradictions.push({
      id: `contradiction-${key}`,
      key,
      options: entries.map((e) => ({
        value: e.value,
        source: e.source,
        evidence: e.evidence,
      })),
      blocking: BLOCKING_KEYS.includes(key),
    });
  }

  return contradictions;
}

/**
 * Refreshes the contradiction list, preserving any the user has
 * already settled so a re-scan does not re-open a decision they made.
 */
export function refreshContradictions(state: FIRCaseState): FIRCaseState {
  const detected = detectContradictions(state.facts);
  const previouslyResolved = new Map(
    state.contradictions
      .filter((c) => c.resolvedValue)
      .map((c) => [c.id, c.resolvedValue as string])
  );

  return {
    ...state,
    contradictions: detected.map((c) =>
      previouslyResolved.has(c.id)
        ? { ...c, resolvedValue: previouslyResolved.get(c.id) }
        : c
    ),
  };
}

/** Records the user's choice for a contested fact. */
export function resolveContradiction(
  state: FIRCaseState,
  contradictionId: string,
  chosenValue: string
): FIRCaseState {
  return {
    ...state,
    contradictions: state.contradictions.map((c) =>
      c.id === contradictionId ? { ...c, resolvedValue: chosenValue } : c
    ),
  };
}

/** Human-readable prompt for the UI, in the user's own terms. */
export function describeContradiction(c: Contradiction): string {
  const readable: Partial<Record<FactKey, string>> = {
    incidentDate: "the date of the incident",
    incidentTime: "the time of the incident",
    incidentLocation: "where it happened",
    financialLoss: "the amount involved",
    accusedName: "the name of the person involved",
    complainantName: "your name",
    victimName: "the name of the affected person",
  };

  const label = readable[c.key] ?? "this detail";
  const [first, second] = c.options;
  const sourceLabel = (s: string) =>
    s === "DOCUMENT" ? "your uploaded document" : s === "USER" ? "what you told us" : "our reading of your account";

  if (!second) return `Please confirm ${label}.`;

  return `You mentioned ${label} as "${first.value}" in ${sourceLabel(
    first.source
  )}, but "${second.value}" appears in ${sourceLabel(second.source)}. Which is correct?`;
}
