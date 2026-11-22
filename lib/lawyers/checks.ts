// ==========================================================
// LegalSetu — automatic verification checks (pure)
// Shown to the admin beside the documents. They support the human
// decision; they never approve anyone on their own.
// ==========================================================

import { DOCUMENT_TYPES } from "./constants";
import { checkEnrolment, isInIndia, promotionalProblems } from "./validation";

export interface CheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

export function automaticChecks(
  p: {
    fullName: string;
    enrolmentNumber: string;
    enrolmentYear: number;
    bio: string | null;
    latitude: number;
    longitude: number;
    photoKey: string | null;
    userEmailVerified: boolean;
    duplicateNameCount: number;
  },
  docTypes: string[],
  now = new Date()
): CheckResult[] {
  const enrolment = checkEnrolment(p.enrolmentNumber, p.enrolmentYear, now);
  const promo = promotionalProblems(p.bio);
  const have = new Set(docTypes);
  const missingDocs = DOCUMENT_TYPES.filter((d) => !have.has(d.key)).map((d) => d.label);
  return [
    { check: "Email verified", ok: p.userEmailVerified, detail: p.userEmailVerified ? "Account email confirmed by OTP." : "Email not verified." },
    { check: "Enrolment number format", ok: !enrolment, detail: enrolment ?? `${p.enrolmentNumber} is well-formed and its year matches.` },
    {
      check: "All documents uploaded",
      ok: missingDocs.length === 0,
      detail: missingDocs.length ? `Missing: ${missingDocs.join(", ")}.` : "Enrolment, practice certificate, photo ID and selfie with ID.",
    },
    { check: "Profile photo", ok: Boolean(p.photoKey), detail: p.photoKey ? "Present (metadata removed)." : "No photo." },
    { check: "Office in India", ok: isInIndia(p.latitude, p.longitude), detail: `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` },
    {
      check: "No advertising (BCI Rule 36)",
      ok: promo.length === 0,
      detail: promo.length ? `Bio contains: ${promo.join(", ")}.` : "Bio states facts only.",
    },
    {
      check: "Name not already verified elsewhere",
      ok: p.duplicateNameCount === 0,
      detail:
        p.duplicateNameCount === 0
          ? "No other verified advocate has this exact name."
          : `${p.duplicateNameCount} verified profile(s) share this name — compare enrolment numbers carefully.`,
    },
  ];
}
