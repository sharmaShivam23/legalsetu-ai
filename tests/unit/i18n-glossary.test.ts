import { describe, it, expect } from "vitest";
import {
  maskProtectedTerms,
  restoreProtectedTerms,
  isTranslatable,
} from "@/lib/i18n/glossary";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  isRTL,
  languageName,
} from "@/lib/i18n/languages";

/** Simulates a model translating masked text while keeping {{n}} intact. */
function pretendTranslate(masked: string): string {
  return masked.replace(/\b(is|the|of|under|at|or|for)\b/g, "␣");
}

describe("language registry", () => {
  it("offers English plus 15 Indian languages", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(16);
    expect(SUPPORTED_LANGUAGES.filter((l) => l.code !== "en")).toHaveLength(15);
  });

  it("defaults to English for missing or unknown values", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage("not-a-language")).toBe("en");
  });

  it("keeps every language code unique", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("marks Urdu as right-to-left and Hindi as left-to-right", () => {
    expect(isRTL("ur")).toBe(true);
    expect(isRTL("hi")).toBe(false);
  });

  it("gives every language a native name and a speech code", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.nativeName.length).toBeGreaterThan(0);
      expect(lang.speechCode).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it("resolves English names used to instruct the model", () => {
    expect(languageName("pa")).toBe("Punjabi");
    expect(languageName("bho")).toBe("Bhojpuri");
  });
});

describe("citation protection", () => {
  const legal =
    "Theft is punishable under Section 303 of the BNS. Contact LegalSetu at help@legalsetu.in or https://legalsetu.in to file a Zero FIR.";

  it("hides citations from the model", () => {
    const { masked } = maskProtectedTerms(legal);
    expect(masked).not.toContain("Section 303");
    expect(masked).not.toContain("BNS");
    expect(masked).not.toContain("LegalSetu");
    expect(masked).not.toContain("https://legalsetu.in");
    expect(masked).not.toContain("help@legalsetu.in");
    expect(masked).toMatch(/\{\{\d+\}\}/);
  });

  it("restores every citation exactly after translation", () => {
    const { masked, tokens } = maskProtectedTerms(legal);
    const restored = restoreProtectedTerms(pretendTranslate(masked), tokens);

    expect(restored).toContain("Section 303");
    expect(restored).toContain("BNS");
    expect(restored).toContain("LegalSetu");
    expect(restored).toContain("Zero FIR");
    expect(restored).toContain("https://legalsetu.in");
    expect(restored).toContain("help@legalsetu.in");
  });

  it("does not double-mask its own placeholders", () => {
    // Regression: a {{n}} pattern running last used to re-capture the
    // placeholders just created, so restore() returned literal "{{0}}".
    const { masked, tokens } = maskProtectedTerms(legal);
    const restored = restoreProtectedTerms(masked, tokens);
    expect(restored).toBe(legal);
    expect(restored).not.toMatch(/\{\{\d+\}\}/);
  });

  it("leaves an unknown placeholder untouched rather than corrupting text", () => {
    const { tokens } = maskProtectedTerms(legal);
    expect(restoreProtectedTerms("text {{999}} more", tokens)).toContain("{{999}}");
  });

  it("preserves BNSS subsection references", () => {
    const text = "See Section 173(1)(ii) of the BNSS for the e-FIR rule.";
    const { masked, tokens } = maskProtectedTerms(text);
    expect(restoreProtectedTerms(masked, tokens)).toBe(text);
  });
});

describe("translatability filter", () => {
  it("skips strings that carry no language", () => {
    expect(isTranslatable("4500")).toBe(false);
    expect(isTranslatable("₹4,500")).toBe(false);
    expect(isTranslatable("•")).toBe(false);
    expect(isTranslatable("  ")).toBe(false);
    expect(isTranslatable("A")).toBe(false);
  });

  it("accepts real copy in any script", () => {
    expect(isTranslatable("File a complaint")).toBe(true);
    expect(isTranslatable("शिकायत दर्ज करें")).toBe(true);
    expect(isTranslatable("வழக்கு")).toBe(true);
  });
});
