import { describe, it, expect } from "vitest";
import {
  auditCitations,
  extractCitedSections,
  adjustEvidenceLevel,
  buildCitationWarning,
} from "@/lib/rag/citation-guard";
import type { RetrievedChunk } from "@/lib/rag/types";

function chunk(text: string, section?: string): RetrievedChunk {
  return {
    chunkId: "c1",
    sourceId: "s1",
    sourceTitle: "The Bharatiya Nyaya Sanhita, 2023",
    actName: "BNS",
    section: section ?? null,
    jurisdiction: "India",
    officialUrl: null,
    verificationStatus: "VERIFIED",
    text,
    similarity: 0.6,
  } as RetrievedChunk;
}

describe("extractCitedSections", () => {
  it("finds the common ways a section is written", () => {
    const found = extractCitedSections(
      "See Section 303, sec. 318, u/s 115 and BNS 351 for details."
    );
    expect(found).toEqual(expect.arrayContaining(["303", "318", "115", "351"]));
  });

  it("returns nothing for prose with no statute reference", () => {
    expect(extractCitedSections("Go to the nearest police station today.")).toEqual([]);
  });
});

describe("auditCitations", () => {
  it("accepts a citation that appears in the retrieved text", () => {
    const chunks = [chunk("303. Theft.—Whoever intending to take dishonestly...")];
    const audit = auditCitations("This falls under Section 303 of the BNS.", chunks);

    expect(audit.verified).toContain("303");
    expect(audit.unverified).toHaveLength(0);
  });

  it("accepts a citation backed by chunk section metadata", () => {
    const chunks = [chunk("Whoever commits theft shall be punished...", "303")];
    const audit = auditCitations("Section 303 applies here.", chunks);

    expect(audit.verified).toContain("303");
    expect(audit.unverified).toHaveLength(0);
  });

  it("flags a section the model produced from memory", () => {
    // The real regression: retrieved text describes snatching but never
    // states the number, and the model supplied "304" on its own.
    const chunks = [chunk("...its snatching, shall be punished with imprisonment...")];
    const audit = auditCitations(
      "Snatching is punishable under Section 304 of the BNS.",
      chunks
    );

    expect(audit.unverified).toContain("304");
    expect(audit.verified).toHaveLength(0);
  });

  it("does not confuse a section number with a longer number", () => {
    const chunks = [chunk("Compensation of 3040 rupees may be awarded.")];
    const audit = auditCitations("See Section 304.", chunks);
    expect(audit.unverified).toContain("304");
  });

  it("reports when an answer cites nothing at all", () => {
    const audit = auditCitations("Go to the police station and file a report.", [
      chunk("some legal text"),
    ]);
    expect(audit.hasNoCitations).toBe(true);
    expect(audit.unverified).toHaveLength(0);
  });

  it("separates supported from unsupported citations in one answer", () => {
    const chunks = [chunk("303. Theft.—Whoever intending to take dishonestly...")];
    const audit = auditCitations("Sections 303 and 304 both apply.", chunks);

    expect(audit.verified).toContain("303");
    expect(audit.unverified).toContain("304");
  });
});

describe("adjustEvidenceLevel", () => {
  it("leaves evidence untouched when every citation checks out", () => {
    const audit = { verified: ["303"], unverified: [], hasNoCitations: false };
    expect(adjustEvidenceLevel("STRONG", audit)).toBe("STRONG");
  });

  it("steps evidence down when some citations are unsupported", () => {
    const audit = { verified: ["303"], unverified: ["304"], hasNoCitations: false };
    expect(adjustEvidenceLevel("STRONG", audit)).toBe("MODERATE");
    expect(adjustEvidenceLevel("MODERATE", audit)).toBe("LIMITED");
  });

  it("drops to LIMITED when no citation is supported", () => {
    const audit = { verified: [], unverified: ["304", "318"], hasNoCitations: false };
    expect(adjustEvidenceLevel("STRONG", audit)).toBe("LIMITED");
  });
});

describe("buildCitationWarning", () => {
  it("stays silent when everything is verified", () => {
    expect(
      buildCitationWarning({ verified: ["303"], unverified: [], hasNoCitations: false })
    ).toBeNull();
  });

  it("names the unverified section in the warning", () => {
    const warning = buildCitationWarning({
      verified: [],
      unverified: ["304"],
      hasNoCitations: false,
    });
    expect(warning).toContain("Section 304");
  });
});
