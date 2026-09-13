import { describe, it, expect } from "vitest";
import {
  detectContradictions,
  valuesConflict,
  refreshContradictions,
  resolveContradiction,
} from "@/lib/fir/contradictions";
import {
  emptyCaseState,
  upsertFact,
  blockingContradictions,
  type CaseFact,
} from "@/lib/fir/case-state";

function fact(
  key: CaseFact["key"],
  value: string,
  source: CaseFact["source"]
): CaseFact {
  return { key, value, source, confidence: "CONFIRMED", recordedAt: new Date().toISOString() };
}

describe("value conflict detection", () => {
  it("treats the same date written differently as agreement", () => {
    expect(valuesConflict("15 August 2026", "15 August 2026")).toBe(false);
    expect(valuesConflict("₹25,000", "25000")).toBe(false);
  });

  it("treats elaboration as agreement, not conflict", () => {
    // Flagging this would train users to click through real warnings.
    expect(valuesConflict("Delhi", "near my house in Delhi")).toBe(false);
  });

  it("flags genuinely different values", () => {
    expect(valuesConflict("15 August 2026", "14 August 2026")).toBe(true);
    expect(valuesConflict("₹25,000", "₹52,000")).toBe(true);
    expect(valuesConflict("Delhi", "Mumbai")).toBe(true);
  });
});

describe("contradiction detection across sources", () => {
  it("finds a document disagreeing with the complainant", () => {
    const facts = [
      fact("incidentDate", "15 August 2026", "USER"),
      fact("incidentDate", "14 August 2026", "DOCUMENT"),
    ];

    const found = detectContradictions(facts);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("incidentDate");
    expect(found[0].options).toHaveLength(2);
    // A date changes the substance of a complaint, so it must block.
    expect(found[0].blocking).toBe(true);
  });

  it("does not invent a conflict when sources agree", () => {
    const facts = [
      fact("incidentLocation", "Delhi", "USER"),
      fact("incidentLocation", "Delhi", "DOCUMENT"),
    ];
    expect(detectContradictions(facts)).toHaveLength(0);
  });

  it("treats a differing description as non-blocking", () => {
    const facts = [
      fact("accusedDescription", "tall man in a blue shirt", "USER"),
      fact("accusedDescription", "man wearing dark clothing", "DOCUMENT"),
    ];
    const found = detectContradictions(facts);
    expect(found).toHaveLength(1);
    expect(found[0].blocking).toBe(false);
  });

  it("ignores a single source with no counterpart", () => {
    expect(detectContradictions([fact("incidentDate", "15 August", "USER")])).toHaveLength(0);
  });

  it("blocks draft generation until a blocking conflict is settled", () => {
    let state = emptyCaseState();
    state = upsertFact(state, fact("financialLoss", "₹25,000", "USER"));
    state = upsertFact(state, fact("financialLoss", "₹52,000", "DOCUMENT"));
    state = refreshContradictions(state);

    expect(blockingContradictions(state)).toHaveLength(1);

    const id = state.contradictions[0].id;
    state = resolveContradiction(state, id, "₹25,000");
    expect(blockingContradictions(state)).toHaveLength(0);
  });

  it("keeps a resolution when facts are re-scanned", () => {
    let state = emptyCaseState();
    state = upsertFact(state, fact("incidentDate", "15 August 2026", "USER"));
    state = upsertFact(state, fact("incidentDate", "14 August 2026", "DOCUMENT"));
    state = refreshContradictions(state);
    state = resolveContradiction(state, state.contradictions[0].id, "15 August 2026");

    // Re-scanning must not reopen a decision the user already made.
    state = refreshContradictions(state);
    expect(state.contradictions[0].resolvedValue).toBe("15 August 2026");
    expect(blockingContradictions(state)).toHaveLength(0);
  });

  it("keeps both versions rather than letting a document overwrite the user", () => {
    let state = emptyCaseState();
    state = upsertFact(state, fact("incidentDate", "15 August 2026", "USER"));
    state = upsertFact(state, fact("incidentDate", "14 August 2026", "DOCUMENT"));

    const dates = state.facts.filter((f) => f.key === "incidentDate");
    expect(dates).toHaveLength(2);
    expect(dates.map((d) => d.source).sort()).toEqual(["DOCUMENT", "USER"]);
  });

  it("replaces an earlier value from the SAME source", () => {
    let state = emptyCaseState();
    state = upsertFact(state, fact("incidentLocation", "Delhi", "USER"));
    state = upsertFact(state, fact("incidentLocation", "Ghaziabad", "USER"));

    const locations = state.facts.filter((f) => f.key === "incidentLocation");
    expect(locations).toHaveLength(1);
    expect(locations[0].value).toBe("Ghaziabad");
  });
});
