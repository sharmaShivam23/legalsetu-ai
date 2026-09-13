import { describe, it, expect } from "vitest";
import { parseLeadingMarker } from "@/lib/rag/marker";
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
