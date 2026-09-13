// ==========================================================
// LegalSetu — FIR Assistant: structured complaint case state
// ----------------------------------------------------------
// The old wizard stored a flat bag of form fields. That made two
// things impossible, both of which the complaint depends on:
//
//  1. PROVENANCE. A police complaint is a sworn factual account.
//     It matters enormously whether a date came from the user's
//     own mouth, from an uploaded bank statement, or from a
//     model's inference. Every fact here therefore carries its
//     source, and lib/fir/draft-validator.ts refuses to emit a
//     draft containing anything that is not traceable to one.
//
//  2. DISAGREEMENT. A flat field can only hold one value, so a
//     document that contradicts the user silently overwrote them
//     (or was silently ignored). Facts are held as a list, so a
//     conflict is representable — and therefore detectable and
//     resolvable by the user rather than by a coin toss.
//
// Legal analysis is deliberately NOT stored alongside facts. The
// complaint is the user's account; any statutory framing is a
// separate, clearly-labelled layer the police ultimately decide.
// ==========================================================

/** Where a fact came from. Never inferred — always recorded. */
export type FactSource =
  /** The user said it, in their own words. */
  | "USER"
  /** Extracted from a document the user uploaded. */
  | "DOCUMENT"
  /** Derived by the model from what the user said (e.g. normalising
   *  "yesterday evening" to a date). Must be confirmed before it can
   *  appear in a draft as if the user had stated it. */
  | "AI_INFERRED";

/** How sure we are. Drives what still needs confirming. */
export type FactConfidence = "CONFIRMED" | "PROBABLE" | "UNCERTAIN";

/**
 * The fact slots a complaint can contain. Deliberately a closed set:
 * the question planner works from "which of these are still empty",
 * and the draft validator works from "is this claim backed by one of
 * these". An open-ended bag would defeat both.
 */
export const FACT_KEYS = [
  "incidentType",
  "incidentDate",
  "incidentTime",
  "incidentLocation",
  "jurisdictionArea",
  "whatHappened",
  "complainantName",
  "complainantContact",
  "complainantAddress",
  "victimName",
  "victimRelationship",
  "accusedKnown",
  "accusedName",
  "accusedDescription",
  "propertyInvolved",
  "financialLoss",
  "injuries",
  "threats",
  "witnesses",
  "evidence",
  "actionsAlreadyTaken",
  "policeContact",
  "previousComplaint",
  "requestedAction",
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

export interface CaseFact {
  key: FactKey;
  /** The value as it will appear in the complaint, in the user's words
   *  where possible. Kept as a string: a complaint is prose, and
   *  over-normalising loses the complainant's own phrasing. */
  value: string;
  source: FactSource;
  confidence: FactConfidence;
  /** Verbatim snippet backing this fact — the user's sentence, or the
   *  line from the document. What makes the fact auditable. */
  evidence?: string;
  /** Which uploaded document this came from, when source is DOCUMENT. */
  documentId?: string;
  recordedAt: string;
}

export interface TimelineEvent {
  /** ISO date, or a free-text approximation ("mid-August"). Approximate
   *  is allowed and labelled; inventing precision is not. */
  date: string;
  time?: string;
  description: string;
  source: FactSource;
  confidence: FactConfidence;
}

export interface Contradiction {
  id: string;
  key: FactKey;
  /** The competing values, each with where it came from. */
  options: { value: string; source: FactSource; evidence?: string }[];
  /** Blocks draft generation until resolved. Set for facts that
   *  materially change the complaint (dates, amounts, identities). */
  blocking: boolean;
  resolvedValue?: string;
}

/**
 * Statutory provisions that MIGHT apply. Kept entirely separate from
 * facts, and never asserted as applicable: police decide the sections.
 * Each entry must trace to the verified corpus (lib/rag), which is why
 * `sourceTitle` is required rather than optional.
 */
export interface LegalContextEntry {
  act: string;
  section: string;
  summary: string;
  sourceTitle: string;
  officialUrl?: string;
}

export type ComplaintStage =
  | "INTAKE"
  | "INVESTIGATING"
  | "REVIEW"
  | "DRAFTED"
  | "FINALISED";

export interface FIRCaseState {
  stage: ComplaintStage;
  language: string;
  facts: CaseFact[];
  timeline: TimelineEvent[];
  contradictions: Contradiction[];
  /** Questions already put to the user, so none is ever repeated. */
  askedQuestions: string[];
  /** Which fact slot the outstanding question is trying to fill. The
   *  user's next message is an answer TO that slot, so it is recorded
   *  there even if extraction misses it — otherwise the same gap stays
   *  open and the intake asks about it forever. */
  pendingKey?: FactKey;
  /** Fact keys the user explicitly declined or marked unknown. Asking
   *  again after someone has said "I don't know" is harassment, not
   *  intake. */
  skippedKeys: FactKey[];
  legalContext: LegalContextEntry[];
  /** Set once the user has reviewed the summary and confirmed it. */
  confirmedAt?: string;
  /** Incremented on every edit so a PDF is never built from stale data. */
  draftVersion: number;
}

export function emptyCaseState(language = "en"): FIRCaseState {
  return {
    stage: "INTAKE",
    language,
    facts: [],
    timeline: [],
    contradictions: [],
    askedQuestions: [],
    skippedKeys: [],
    legalContext: [],
    draftVersion: 0,
  };
}

/** Most recent value recorded for a slot, if any. */
export function getFact(state: FIRCaseState, key: FactKey): CaseFact | undefined {
  const matches = state.facts.filter((f) => f.key === key);
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

export function hasFact(state: FIRCaseState, key: FactKey): boolean {
  return Boolean(getFact(state, key)?.value?.trim());
}

/**
 * Records a fact, replacing any previous value for the same slot from
 * the same source. Values from DIFFERENT sources are both retained —
 * that is exactly the disagreement the contradiction detector needs to
 * see, and silently overwriting it is how a document quietly rewrites
 * the complainant's own account.
 */
export function upsertFact(state: FIRCaseState, fact: CaseFact): FIRCaseState {
  const facts = state.facts.filter(
    (f) => !(f.key === fact.key && f.source === fact.source)
  );
  return { ...state, facts: [...facts, fact] };
}

/** Fact slots that are still empty and have not been skipped. */
export function missingKeys(state: FIRCaseState, required: FactKey[]): FactKey[] {
  return required.filter(
    (k) => !hasFact(state, k) && !state.skippedKeys.includes(k)
  );
}

/** Contradictions that must be resolved before a draft may be generated. */
export function blockingContradictions(state: FIRCaseState): Contradiction[] {
  return state.contradictions.filter((c) => c.blocking && !c.resolvedValue);
}

/**
 * Everything the draft is allowed to assert, as plain strings. The
 * validator checks generated text against this set, so anything the
 * user never said and no document contained cannot survive into a
 * complaint bearing their signature.
 */
export function supportedValues(state: FIRCaseState): string[] {
  const values = state.facts.map((f) => f.value);
  const timeline = state.timeline.flatMap((e) => [e.date, e.description, e.time ?? ""]);
  const resolved = state.contradictions
    .map((c) => c.resolvedValue)
    .filter((v): v is string => Boolean(v));
  return [...values, ...timeline, ...resolved].filter(Boolean);
}
