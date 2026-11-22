import { describe, expect, it } from "vitest";
import { speechLanguageFor } from "@/lib/voice/speech-text";

describe("speechLanguageFor", () => {
  it("keeps the reply language when the text matches it", () => {
    expect(speechLanguageFor("आपका डिपॉजिट वापस मिलेगा।", "hi")).toBe("hi");
    expect(speechLanguageFor("Send a written notice first.", "en")).toBe("en");
    expect(speechLanguageFor("तुमची ठेव परत मिळेल.", "mr")).toBe("mr");
  });

  it("switches to the script's voice when the model answered in another language", () => {
    // The bug: English requested, Hindi answered, English voice read Devanagari.
    expect(speechLanguageFor("आपके किराए का पता और शहर कौन‑सा था,", "en")).toBe("hi");
    expect(speechLanguageFor("உங்கள் வைப்புத்தொகை திருப்பி தரப்படும்", "en")).toBe("ta");
    expect(speechLanguageFor("আপনার জমা ফেরত পাবেন", "hi")).toBe("bn");
  });

  it("does not split a Hindi answer across voices for an English acronym", () => {
    expect(speechLanguageFor("BNS की धारा 303 के तहत", "hi")).toBe("hi");
    expect(speechLanguageFor("FIR", "hi")).toBe("hi");
  });

  it("uses English for a real English sentence inside a Hindi conversation", () => {
    expect(speechLanguageFor("You should send a written notice to your landlord.", "hi")).toBe("en");
  });

  it("accepts region-tagged fallbacks", () => {
    expect(speechLanguageFor("Hello there, how can I help you today?", "en-IN")).toBe("en");
  });
});
