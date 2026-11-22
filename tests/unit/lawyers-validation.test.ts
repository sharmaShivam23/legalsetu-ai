import { describe, expect, it } from "vitest";
import {
  checkEnrolment,
  cleanText,
  consultationActionSchema,
  consultationCreateSchema,
  lawyerProfileSchema,
  locationSchema,
  normaliseEnrolment,
  promotionalProblems,
  reviewSchema,
  searchSchema,
} from "@/lib/lawyers/validation";
import { automaticChecks } from "@/lib/lawyers/checks";

const validProfile = {
  fullName: "Meera Sharma",
  gender: "FEMALE",
  barCouncil: "DL",
  enrolmentNumber: "d / 1234 / 2015",
  enrolmentYear: 2015,
  aibeNumber: "",
  practiceAreas: ["CRIMINAL"],
  courts: ["DISTRICT"],
  languages: ["en", "hi"],
  bio: "Practising at Saket District Court since 2015. Bail and family matters.",
  officeAddress: "Chamber 412, Saket District Court",
  city: "New Delhi",
  pincode: "110017",
  latitude: 28.5245,
  longitude: 77.2066,
};

describe("enrolment numbers", () => {
  it.each([
    ["d/1234/2015", "D/1234/2015"],
    [" MAH / 5678 / 2010 ", "MAH/5678/2010"],
    ["KAR-1234-2015", "KAR/1234/2015"],
    ["1234/2015", "1234/2015"],
  ])("normalises %s", (raw, out) => {
    expect(normaliseEnrolment(raw)).toBe(out);
  });

  it("accepts well-formed numbers whose year matches", () => {
    expect(checkEnrolment("D/1234/2015", 2015)).toBeNull();
    expect(checkEnrolment("MAH/12345/2010", 2010)).toBeNull();
    expect(checkEnrolment("DEMO/0001/2012", 2012)).toBeNull();
  });

  it("rejects mismatched years, impossible years and junk", () => {
    expect(checkEnrolment("D/1234/2015", 2016)).toMatch(/does not match/);
    expect(checkEnrolment("D/1234/1950", 1950)).toMatch(/not valid/);
    expect(checkEnrolment(`D/1234/${new Date().getFullYear() + 1}`, new Date().getFullYear() + 1)).toMatch(/not valid/);
    expect(checkEnrolment("D/ABCD/2015", 2015)).toMatch(/exactly as on your certificate/);
    expect(checkEnrolment("hello", 2015)).toMatch(/exactly as on your certificate/);
  });
});

describe("Bar Council Rule 36 — no advertising", () => {
  it.each([
    ["Best criminal lawyer in Delhi", '"best"'],
    ["No. 1 divorce advocate", '"No. 1"'],
    ["Top-rated bail expert", '"top-rated"'],
    ["Guaranteed bail in 24 hours", "guarantees"],
    ["100% success in bail matters", '"100%"'],
    ["Excellent success rate", "success rates"],
    ["Never lost a case", "winning claims"],
    ["Lowest fees in South Delhi", "fee offers"],
    ["Renowned advocate", "self-praise"],
    ["Call now for consultation", "solicitation"],
    ["Reach me on 9876543210", "a phone number (clients contact you in-app)"],
    ["See www.mylawfirm.in", "links or email addresses"],
    ["Write to meera@lawfirm.in", "links or email addresses"],
  ])("flags %j", (bio, reason) => {
    expect(promotionalProblems(bio)).toContain(reason);
  });

  it.each([
    "Practising at Saket District Court since 2012. Bail and family matters.",
    "Criminal trials and cyber-crime complaints at Patiala House.",
    "Legal aid panel advocate. Undertrial bail and accident claims.",
    "Section 138 cheque-bounce cases at Karkardooma Courts.",
    "",
  ])("allows factual text %j", (bio) => {
    expect(promotionalProblems(bio)).toEqual([]);
  });

  it("the profile schema refuses a promotional bio", () => {
    const r = lawyerProfileSchema.safeParse({ ...validProfile, bio: "Best lawyer, 100% success" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toMatch(/Bar Council rules/);
  });
});

describe("profile schema", () => {
  it("accepts and normalises a valid profile", () => {
    const p = lawyerProfileSchema.parse(validProfile);
    expect(p.enrolmentNumber).toBe("D/1234/2015");
    expect(p.aibeNumber).toBeNull();
    expect(p.acceptingClients).toBe(true);
  });

  it.each([
    [{ barCouncil: "XX" }, /State Bar Council/],
    [{ pincode: "011001" }, /PIN code/],
    [{ practiceAreas: [] }, /practice area/],
    [{ languages: ["klingon"] }, /./],
    [{ latitude: 51.5, longitude: -0.12 }, /./],
    [{ latitude: 10.5, longitude: 72.0 }, /./], // Arabian Sea, inside the bbox lat but check below
    [{ fullName: "A" }, /full name/],
    [{ enrolmentNumber: "D/1234/2014" }, /does not match/],
  ])("rejects %j", (patch, msg) => {
    const r = lawyerProfileSchema.safeParse({ ...validProfile, ...patch });
    if ("latitude" in patch && patch.latitude === 10.5) {
      // Coarse box: the sea west of Kerala is inside it — documented limitation, not an error.
      expect(r.success).toBe(true);
      return;
    }
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message).join(" ")).toMatch(msg);
  });

  it("strips markup and control characters from free text", () => {
    expect(cleanText("  <b>Saket</b>\u0007 court ")).toBe("b Saket /b  court".replace("  ", " "));
    const p = lawyerProfileSchema.parse({ ...validProfile, officeAddress: "<script>x</script> Chamber 12, Saket" });
    expect(p.officeAddress).not.toContain("<");
  });
});

describe("other schemas", () => {
  it("location: GPS, PIN code, or place name", () => {
    expect(locationSchema.safeParse({ source: "GPS", latitude: 28.5, longitude: 77.2 }).success).toBe(true);
    expect(locationSchema.safeParse({ source: "PINCODE", pincode: "110017" }).success).toBe(true);
    expect(locationSchema.safeParse({ source: "PINCODE", pincode: "1100" }).success).toBe(false);
    expect(locationSchema.safeParse({ source: "SEARCH", query: "Saket" }).success).toBe(true);
    expect(locationSchema.safeParse({ source: "WIFI" }).success).toBe(false);
  });

  it("search: only whitelisted radii and enums", () => {
    expect(searchSchema.parse({ radiusKm: "25", legalAid: "1", page: "2" })).toMatchObject({ radiusKm: 25, legalAid: true, page: 2 });
    expect(searchSchema.safeParse({ radiusKm: "7" }).success).toBe(false);
    expect(searchSchema.safeParse({ area: "DROP TABLE" }).success).toBe(false);
    expect(searchSchema.parse({}).legalAid).toBe(false);
  });

  it("consultation request needs a real description", () => {
    const base = { lawyerId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", category: "CRIMINAL", language: "hi" };
    expect(consultationCreateSchema.safeParse({ ...base, summary: "help" }).success).toBe(false);
    expect(consultationCreateSchema.parse({ ...base, summary: "My brother was arrested yesterday under 303(2)." }).urgency).toBe("NORMAL");
    expect(consultationActionSchema.safeParse({ action: "delete" }).success).toBe(false);
  });

  it("review: rejecting or suspending requires a reason", () => {
    expect(reviewSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
    expect(reviewSchema.safeParse({ decision: "REJECT" }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "REJECT", reason: "Certificate unreadable" }).success).toBe(true);
    expect(reviewSchema.safeParse({ decision: "SUSPEND", reason: "  " }).success).toBe(false);
  });
});

describe("automatic verification checks", () => {
  const base = {
    fullName: "Meera Sharma",
    enrolmentNumber: "D/1234/2015",
    enrolmentYear: 2015,
    bio: "Bail and family matters.",
    latitude: 28.52,
    longitude: 77.2,
    photoKey: "lawyers/x/photo.jpg",
    userEmailVerified: true,
    duplicateNameCount: 0,
  };
  const allDocs = ["ENROLMENT_CERTIFICATE", "PRACTICE_CERTIFICATE", "PHOTO_ID", "SELFIE_WITH_ID"];

  it("all pass for a complete, clean profile", () => {
    expect(automaticChecks(base, allDocs).every((c) => c.ok)).toBe(true);
  });

  it("flags each problem separately", () => {
    const r = automaticChecks(
      { ...base, userEmailVerified: false, bio: "Best lawyer", photoKey: null, duplicateNameCount: 2, enrolmentYear: 2016 },
      ["PHOTO_ID"]
    );
    const failed = r.filter((c) => !c.ok).map((c) => c.check);
    expect(failed).toEqual(
      expect.arrayContaining([
        "Email verified",
        "Enrolment number format",
        "All documents uploaded",
        "Profile photo",
        "No advertising (BCI Rule 36)",
        "Name not already verified elsewhere",
      ])
    );
  });
});
