import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  MIN_INTAKE_QUESTIONS,
  MAX_INTAKE_QUESTIONS,
  ASK_MARKER,
  REPORT_MARKER,
  type IntakeState,
} from "@/lib/rag/prompt";

const intake = (asked: string[], answers: string[] = []): IntakeState => ({
  askedQuestions: asked,
  userAnswers: answers,
});

function casePrompt(state: IntakeState) {
  return buildSystemPrompt("en", "case", state);
}

describe("case-mode intake prompt", () => {
  it("keeps asking while below the minimum", () => {
    const prompt = casePrompt(intake(["When did this happen?"]));
    expect(prompt).toContain("You are still in intake");
    expect(prompt).toContain(`MUST respond with ${ASK_MARKER}`);
    expect(prompt).toContain("Do NOT jump to the report yet");
  });

  it("allows the report only once the minimum is met", () => {
    const asked = Array.from({ length: MIN_INTAKE_QUESTIONS }, (_, i) => `Q${i + 1}?`);
    const prompt = casePrompt(intake(asked));
    expect(prompt).not.toContain("Do NOT jump to the report yet");
    expect(prompt).toContain(`minimum ${MIN_INTAKE_QUESTIONS}`);
  });

  it("forces the report once the maximum is reached", () => {
    const asked = Array.from({ length: MAX_INTAKE_QUESTIONS }, (_, i) => `Q${i + 1}?`);
    const prompt = casePrompt(intake(asked));
    expect(prompt).toContain(`MUST respond with ${REPORT_MARKER} now`);
    expect(prompt).toContain("that is the maximum");
  });

  it("lists previously asked questions verbatim so they cannot be repeated", () => {
    const asked = [
      "When exactly did the theft happen?",
      "Where were you when it happened?",
    ];
    const prompt = casePrompt(intake(asked));

    expect(prompt).toContain("NEVER ASK ANY OF THESE AGAIN");
    for (const q of asked) expect(prompt).toContain(q);
  });

  it("collapses newlines in a recalled question so the list stays readable", () => {
    const prompt = casePrompt(intake(["Thanks.\n\nWhen did   this happen?"]));
    expect(prompt).toContain("1. Thanks. When did this happen?");
  });

  it("says this is the first question when nothing has been asked", () => {
    const prompt = casePrompt(intake([]));
    expect(prompt).toContain("This is your FIRST question");
    expect(prompt).not.toContain("NEVER ASK ANY OF THESE AGAIN");
  });

  it("carries the intake checklist and the one-question-per-turn rule", () => {
    const prompt = casePrompt(intake([]));
    expect(prompt).toContain("INTAKE CHECKLIST");
    for (const slot of ["WHAT HAPPENED", "WHEN", "WHERE", "WHO", "EVIDENCE", "ACTION ALREADY TAKEN"]) {
      expect(prompt).toContain(slot);
    }
    expect(prompt).toContain("ONE question per turn");
  });

  it("always honours an explicit request to skip ahead", () => {
    // Even at zero questions asked, the escape hatch must be present.
    expect(casePrompt(intake([]))).toContain("skip the questions");
  });

  it("requires the report to actually use the gathered facts", () => {
    const prompt = casePrompt(intake(["Q1?", "Q2?", "Q3?"]));
    expect(prompt).toContain("must actually USE what you gathered");
  });

  it("leaves quick and knowledge modes free of intake instructions", () => {
    for (const mode of ["quick", "knowledge"] as const) {
      const prompt = buildSystemPrompt("en", mode);
      expect(prompt).not.toContain("INTAKE CHECKLIST");
      expect(prompt).not.toContain(ASK_MARKER);
    }
  });
});
