import { describe, it, expect } from "vitest";
import {
  appLanguageFromSarvam,
  sarvamLanguageCode,
  sarvamModelFor,
  sarvamSupportsLanguage,
} from "@/lib/i18n/sarvam-translate";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

/**
 * These three mappings are small, but every one of them was found by
 * watching real requests fail rather than by reading documentation, and
 * each failure was silent — the app degraded to English or to the LLM
 * instead of reporting anything. Tests are cheaper than rediscovering
 * them.
 */
describe("Sarvam language mapping", () => {
  it("sends Odia as od-IN, not or-IN", () => {
    // The app says "or"; Sarvam says "od" and rejects "or-IN" with a 400
    // listing the codes it accepts. Getting this wrong means Odia
    // silently falls through to the LLM on every request.
    expect(sarvamLanguageCode("or")).toBe("od-IN");
  });

  it("maps Sarvam's Odia code back to the app's code", () => {
    expect(appLanguageFromSarvam("od-IN")).toBe("or");
  });

  it("round-trips every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const code = sarvamLanguageCode(lang.code);
      if (!code) continue; // mai/bho/sat: not on Sarvam, LLM handles them
      expect(appLanguageFromSarvam(code)).toBe(lang.code);
    }
  });

  it("returns null for languages Sarvam cannot translate", () => {
    // Maithili, Bhojpuri and Santali are on neither Sarvam model. They
    // must report unsupported so the caller uses the LLM path instead of
    // sending a request that 400s.
    for (const code of ["mai", "bho", "sat"]) {
      expect(sarvamLanguageCode(code)).toBeNull();
      expect(sarvamSupportsLanguage(code)).toBe(false);
    }
  });

  it("accepts a regional tag as well as a bare code", () => {
    expect(sarvamLanguageCode("hi-IN")).toBe("hi-IN");
    expect(sarvamLanguageCode("HI")).toBe("hi-IN");
  });

  it("handles a missing or empty language without throwing", () => {
    expect(sarvamLanguageCode("")).toBeNull();
    expect(appLanguageFromSarvam(null)).toBeNull();
    expect(appLanguageFromSarvam(undefined)).toBeNull();
  });
});

describe("Sarvam model selection", () => {
  it("uses mayura:v1 for the languages it supports", () => {
    for (const code of ["hi", "bn", "gu", "kn", "ml", "mr", "or", "pa", "ta", "te"]) {
      expect(sarvamModelFor(code)).toBe("mayura:v1");
    }
  });

  it("uses sarvam-translate:v1 for Urdu and Assamese", () => {
    // mayura:v1 rejects these outright:
    //   "Language 'ur-IN' is not supported in mayura:v1.
    //    Please switch to sarvam-translate:v1"
    expect(sarvamModelFor("ur")).toBe("sarvam-translate:v1");
    expect(sarvamModelFor("as")).toBe("sarvam-translate:v1");
  });

  it("keeps every Sarvam-supported language on a model that accepts it", () => {
    // The guard that matters: a language present in the code table but
    // routed to a model that refuses it fails on every single request.
    for (const lang of SUPPORTED_LANGUAGES) {
      if (!sarvamSupportsLanguage(lang.code)) continue;
      const model = sarvamModelFor(lang.code);
      if (lang.code === "ur" || lang.code === "as") {
        expect(model).toBe("sarvam-translate:v1");
      } else {
        expect(model).toBe("mayura:v1");
      }
    }
  });
});
