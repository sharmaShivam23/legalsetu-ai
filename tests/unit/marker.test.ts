import { describe, it, expect } from "vitest";
import { parseLeadingMarker, stripLeadingMarker, stripControlTokens } from "@/lib/rag/marker";
import { ASK_MARKER, REPORT_MARKER } from "@/lib/rag/prompt";

describe("parseLeadingMarker", () => {
  it("stays unresolved while the buffer could still become either marker", () => {
    expect(parseLeadingMarker("").resolved).toBe(false);
    expect(parseLeadingMarker("@").resolved).toBe(false);
    expect(parseLeadingMarker("@@A").resolved).toBe(false);
    expect(parseLeadingMarker("@@REP").resolved).toBe(false);
  });

  it("recognises @@ASK@@ and strips it plus the following newline", () => {
    const result = parseLeadingMarker(`${ASK_MARKER}\nWhat happened first?`);
    expect(result.resolved).toBe(true);
    expect(result.kind).toBe("question");
    expect(result.rest).toBe("What happened first?");
  });

  it("recognises @@REPORT@@ and strips it plus the following newline", () => {
    const result = parseLeadingMarker(`${REPORT_MARKER}\n## Answer\nSome text`);
    expect(result.resolved).toBe(true);
    expect(result.kind).toBe("report");
    expect(result.rest).toBe("## Answer\nSome text");
  });

  it("tolerates a leading blank line or space before the marker", () => {
    const result = parseLeadingMarker(`\n  ${ASK_MARKER}\nQuestion?`);
    expect(result.kind).toBe("question");
    expect(result.rest).toBe("Question?");
  });

  it("tolerates space instead of newline right after the marker", () => {
    const result = parseLeadingMarker(`${REPORT_MARKER} ## Answer`);
    // No leading newline to strip — rest starts right after the marker.
    expect(result.kind).toBe("report");
    expect(result.rest).toBe(" ## Answer");
  });

  it("falls back to report and shows everything when no marker ever appears", () => {
    const longNoMarkerText = "This model ignored the protocol entirely and just answered.";
    const result = parseLeadingMarker(longNoMarkerText);
    expect(result.resolved).toBe(true);
    expect(result.kind).toBe("report");
    expect(result.rest).toBe(longNoMarkerText);
  });

  it("does not falsely resolve on a short prefix shared by both markers", () => {
    // "@@A" could still be the start of "@@ASK@@" - must stay unresolved.
    const result = parseLeadingMarker("@@A");
    expect(result.resolved).toBe(false);
  });
});

describe("parseLeadingMarker — markers as models really write them", () => {
  it("handles a lower-case marker with a leaked <|message|> token (seen in Hindi voice mode)", () => {
    const result = parseLeadingMarker("@@Ask<|message|>आपके वॉलेट के चोरी होने की बात समझ आया।");
    expect(result.resolved).toBe(true);
    expect(result.kind).toBe("question");
    expect(result.rest).toBe("आपके वॉलेट के चोरी होने की बात समझ आया।");
  });

  it("handles the marker transliterated into Devanagari", () => {
    const result = parseLeadingMarker("@@आस्क<|message|>समझ गया, घर में।");
    expect(result.kind).toBe("question");
    expect(result.rest).toBe("समझ गया, घर में।");
  });

  it("recognises a translated REPORT marker", () => {
    const result = parseLeadingMarker("@@रिपोर्ट@@\n## उत्तर");
    expect(result.kind).toBe("report");
    expect(result.rest).toBe("## उत्तर");
  });

  it("waits while a control token is still arriving", () => {
    expect(parseLeadingMarker("@@Ask").resolved).toBe(false);
    expect(parseLeadingMarker("@@Ask<|mess").resolved).toBe(false);
    expect(parseLeadingMarker("<|chan").resolved).toBe(false);
  });

  it("strips control tokens before the marker", () => {
    const result = parseLeadingMarker("<|channel|>final<|message|>@@ASK@@\nWhen did it happen?");
    expect(result.kind).toBe("question");
    expect(result.rest).toBe("When did it happen?");
  });

  it("never shows a marker that was not recognised as either kind", () => {
    const result = parseLeadingMarker("@@Frage@@ Wann ist das passiert?");
    expect(result.resolved).toBe(true);
    expect(result.rest).not.toContain("@@");
  });

  it("cleans replies already saved with a broken marker", () => {
    expect(stripLeadingMarker("@@Ask<|message|>क्या आप बता सकते हैं?")).toBe("क्या आप बता सकते हैं?");
    expect(stripLeadingMarker("A normal reply with no marker.")).toBe("A normal reply with no marker.");
    expect(stripControlTokens("Answer<|end|>")).toBe("Answer");
  });
});
