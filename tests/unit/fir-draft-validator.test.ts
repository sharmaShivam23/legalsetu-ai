import { describe, it, expect } from "vitest";
import { validateDraft, stripUnsupportedStatutes } from "@/lib/fir/draft-validator";
import { emptyCaseState, upsertFact, type FIRCaseState, type CaseFact } from "@/lib/fir/case-state";

function fact(key: CaseFact["key"], value: string, source: CaseFact["source"] = "USER"): CaseFact {
  return { key, value, source, confidence: "CONFIRMED", recordedAt: new Date().toISOString() };
}

function stateWith(facts: CaseFact[], legal: FIRCaseState["legalContext"] = []): FIRCaseState {
  let s = emptyCaseState();
  for (const f of facts) s = upsertFact(s, f);
  return { ...s, legalContext: legal };
}

describe("FIR draft fabrication guard", () => {
  it("accepts a draft whose facts all trace to the case state", () => {
    const state = stateWith([
      fact("incidentDate", "15 August 2026"),
      fact("financialLoss", "₹25,000"),
    ]);

    const draft = `The incident occurred on 15 August 2026. A sum of ₹25,000 was transferred.`;
    expect(validateDraft(draft, state).ok).toBe(true);
  });

  it("catches an invented date", () => {
    const state = stateWith([fact("incidentDate", "15 August 2026")]);
    const draft = `The incident occurred on 12 September 2026.`;

    const result = validateDraft(draft, state);
    expect(result.ok).toBe(false);
    expect(result.issues[0].type).toBe("DATE");
    expect(result.issues[0].value).toContain("12 September 2026");
  });

  it("catches an invented amount", () => {
    const state = stateWith([fact("financialLoss", "₹25,000")]);
    const draft = `The complainant lost ₹90,000 in the transaction.`;

    const result = validateDraft(draft, state);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === "AMOUNT")).toBe(true);
  });

  it("allows the same date written in a different format", () => {
    // Reformatting is fine; inventing is not.
    const state = stateWith([fact("incidentDate", "15/08/2026")]);
    const draft = `The incident occurred on 15 August 2026.`;
    expect(validateDraft(draft, state).ok).toBe(true);
  });

  it("allows a formatted amount backed by a bare number the user typed", () => {
    const state = stateWith([fact("whatHappened", "they took 25000 from my account")]);
    const draft = `A sum of ₹25,000 was debited.`;
    expect(validateDraft(draft, state).ok).toBe(true);
  });

  it("rejects a statute that was never retrieved from the corpus", () => {
    const state = stateWith([fact("incidentType", "theft")]);
    const draft = `This offence falls under Section 303 of the BNS.`;

    const result = validateDraft(draft, state);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === "STATUTE")).toBe(true);
  });

  it("accepts a statute that WAS retrieved from the corpus", () => {
    const state = stateWith(
      [fact("incidentType", "theft")],
      [
        {
          act: "BNS",
          section: "303",
          summary: "Theft",
          sourceTitle: "The Bharatiya Nyaya Sanhita, 2023",
        },
      ]
    );
    const draft = `The complainant is informed that Section 303 may be relevant.`;
    expect(validateDraft(draft, state).ok).toBe(true);
  });

  it("accepts a purely factual draft that cites nothing at all", () => {
    const state = stateWith([fact("whatHappened", "my phone was taken on the street")]);
    const draft = `The complainant states that his phone was taken on the street.`;
    expect(validateDraft(draft, state).ok).toBe(true);
  });

  it("reports every distinct problem, not just the first", () => {
    const state = stateWith([fact("incidentDate", "15 August 2026")]);
    const draft = `On 01 January 2020 the complainant lost ₹75,000 under Section 420.`;

    const result = validateDraft(draft, state);
    const types = result.issues.map((i) => i.type);
    expect(types).toContain("DATE");
    expect(types).toContain("AMOUNT");
    expect(types).toContain("STATUTE");
  });

  it("strips unverified statute lines but keeps the factual account", () => {
    const state = stateWith([fact("whatHappened", "phone stolen")]);
    const draft = [
      "The complainant states that his phone was stolen.",
      "This attracts Section 303 of the BNS.",
      "The complainant requests appropriate action.",
    ].join("\n");

    const cleaned = stripUnsupportedStatutes(draft, state);
    expect(cleaned).toContain("phone was stolen");
    expect(cleaned).toContain("requests appropriate action");
    expect(cleaned).not.toContain("Section 303");
  });

  it("keeps statute lines that are verified", () => {
    const state = stateWith(
      [fact("whatHappened", "phone stolen")],
      [{ act: "BNS", section: "303", summary: "Theft", sourceTitle: "BNS 2023" }]
    );
    const draft = "This may relate to Section 303 of the BNS.";
    expect(stripUnsupportedStatutes(draft, state)).toContain("Section 303");
  });
});
