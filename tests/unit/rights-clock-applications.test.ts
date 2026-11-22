import { describe, expect, it } from "vitest";
import { runRightsClock, type RightsClockInput } from "@/lib/rights-clock";
import {
  ApplicationUnavailableError,
  buildApplication,
  canDraft,
  type ApplicationParty,
} from "@/lib/rights-clock/applications";
import { renderComplaintPdf, type ComplaintDocument } from "@/lib/fir/pdf";
import { cleanText, engineInputSchema, trackerSchema } from "@/lib/rights-clock/schema";

const input: RightsClockInput = {
  arrestDate: "2026-08-30",
  firstRemandDate: "2026-08-31",
  sections: ["303(2)", "3(5)"],
  otherLawCharges: false,
  chargesheetFiledOn: null,
  priorConviction: "NO",
  otherPendingCases: "NO",
  inCustody: true,
};
const bare: ApplicationParty = { personName: "Ravi Kumar" };
const full: ApplicationParty = {
  personName: "Ravi Kumar",
  relationship: "Brother",
  firNumber: "0123/2026",
  policeStation: "Saket",
  courtName: "Court of the JMFC, Saket",
  prisonName: "Central Jail No. 4, Tihar",
};

const allText = (d: ComplaintDocument) =>
  [d.title, ...d.addressee, d.subject, d.salutation, d.opening, ...d.sections.flatMap((s) => [s.heading, ...s.body]), d.declaration, d.signatureName, d.place ?? ""].join("\n");

describe("canDraft", () => {
  it("offers default bail only while it can still be claimed", () => {
    expect(canDraft("default-bail", runRightsClock(input, "2026-10-30")).ok).toBe(true);
    const inTime = runRightsClock({ ...input, chargesheetFiledOn: "2026-10-01" }, "2026-11-09");
    expect(canDraft("default-bail", inTime)).toMatchObject({ ok: false });
  });

  it("offers §479 drafts only when §479 applies", () => {
    expect(canDraft("section-479", runRightsClock(input, "2026-11-09")).ok).toBe(true);
    const murder = runRightsClock({ ...input, sections: ["103(1)"] }, "2026-11-09");
    expect(canDraft("section-479", murder).ok).toBe(false);
    expect(canDraft("jail-letter", murder).ok).toBe(false);
    expect(() => buildApplication("section-479", bare, input, murder)).toThrow(ApplicationUnavailableError);
  });
});

describe("default bail application", () => {
  const result = runRightsClock(input, "2026-10-30");

  it("leaves unknown facts as visible blanks — never invents them", () => {
    const text = allText(buildApplication("default-bail", bare, input, result));
    expect(text).toContain("[FIR number]");
    expect(text).toContain("[Police station]");
    expect(text).toContain("[Name of court]");
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("uses the facts that were given, and the computed dates", () => {
    const doc = buildApplication("default-bail", full, input, result);
    const text = allText(doc);
    expect(doc.subject).toContain("0123/2026");
    expect(text).toContain("Court of the JMFC, Saket");
    expect(text).toContain("31 Aug 2026"); // first remand
    expect(text).toContain("29 Oct 2026"); // last day of the 60-day period
    expect(text).toContain("Kapil Wadhawan");
    expect(text).toContain("303(2), 3(5)");
    expect(doc.signatureName).toContain("brother");
  });

  it("blanks the expiry date when the remand date was only estimated", () => {
    const est = { ...input, firstRemandDate: null };
    const text = allText(buildApplication("default-bail", bare, est, runRightsClock(est, "2026-10-31")));
    expect(text).toContain("[date of first remand — see remand order]");
    expect(text).not.toContain("30 Oct 2026");
  });

  it("argues the 60-day reading in a disputed case", () => {
    const disputed = { ...input, sections: ["308(5)"] };
    const text = allText(buildApplication("default-bail", bare, disputed, runRightsClock(disputed, "2026-11-01")));
    expect(text).toMatch(/minimum of ten years/);
    expect(text).toMatch(/sixty days/);
  });
});

describe("§479 application and jail letter", () => {
  const result = runRightsClock(input, "2027-09-01");

  it("first-time offender: bond after one-third", () => {
    const text = allText(buildApplication("section-479", full, input, result));
    expect(text).toMatch(/release the Applicant on bond/);
    expect(text).toContain("31 Aug 2027");
    expect(text).toContain("first-time offender");
    expect(text).toContain("1382 Prisons");
  });

  it("asks for confirmation when conviction history is unknown", () => {
    const unknown = { ...input, priorConviction: "UNKNOWN" as const };
    const text = allText(buildApplication("section-479", full, unknown, runRightsClock(unknown, "2028-03-01")));
    expect(text).toMatch(/\[State whether the Applicant has ever been convicted/);
  });

  it("the jail letter invokes §479(3) and names the prison", () => {
    const doc = buildApplication("jail-letter", full, input, result);
    expect(doc.addressee).toContain("Central Jail No. 4, Tihar");
    expect(allText(doc)).toMatch(/Section 479\(3\)/);
    expect(doc.signatureName).toContain("Brother of Ravi Kumar");
  });
});

describe("PDF rendering", () => {
  it("produces a real PDF, including a Devanagari name", () => {
    const party = { ...full, personName: "रवि कुमार" };
    const doc = buildApplication("default-bail", party, input, runRightsClock(input, "2026-10-30"));
    const pdf = renderComplaintPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});

describe("request validation", () => {
  it("cleans free text", () => {
    expect(cleanText("  Ravi\u0007 <b>Kumar</b>\n ")).toBe("Ravi b Kumar /b");
  });

  it("accepts a well-formed tracker and normalises blanks", () => {
    const parsed = trackerSchema.parse({
      personName: "  Ravi  ",
      arrestDate: "2026-08-30",
      firstRemandDate: "",
      sections: ["303(2)", "", " "],
      firNumber: "",
    });
    expect(parsed).toMatchObject({
      personName: "Ravi",
      firstRemandDate: null,
      sections: ["303(2)"],
      firNumber: null,
      priorConviction: "UNKNOWN",
      inCustody: true,
      remindersEnabled: true,
    });
  });

  it("rejects bad dates, empty names and oversized lists", () => {
    expect(engineInputSchema.safeParse({ arrestDate: "30/08/2026", sections: ["303"] }).success).toBe(false);
    expect(trackerSchema.safeParse({ personName: "   ", arrestDate: "2026-08-30", sections: ["303"] }).success).toBe(false);
    expect(
      engineInputSchema.safeParse({ arrestDate: "2026-08-30", sections: Array.from({ length: 26 }, () => "303") }).success
    ).toBe(false);
    expect(trackerSchema.safeParse({ personName: "A", arrestDate: "2026-08-30", sections: [], caseId: "not-a-uuid" }).success).toBe(false);
  });
});
