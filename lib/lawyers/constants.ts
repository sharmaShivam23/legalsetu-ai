// ==========================================================
// LegalSetu — Verified Lawyer Connect: shared constants
// (client-safe: no server imports)
// ==========================================================

import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

/** State Bar Councils constituted under the Advocates Act, 1961. */
export const BAR_COUNCILS = [
  { code: "AP", name: "Bar Council of Andhra Pradesh" },
  { code: "AS", name: "Bar Council of Assam, Nagaland, Meghalaya, Manipur, Tripura, Mizoram & Arunachal Pradesh" },
  { code: "BR", name: "Bar Council of Bihar" },
  { code: "CG", name: "Bar Council of Chhattisgarh" },
  { code: "DL", name: "Bar Council of Delhi" },
  { code: "GJ", name: "Bar Council of Gujarat" },
  { code: "HP", name: "Bar Council of Himachal Pradesh" },
  { code: "JK", name: "Bar Council of Jammu & Kashmir and Ladakh" },
  { code: "JH", name: "Bar Council of Jharkhand" },
  { code: "KA", name: "Karnataka State Bar Council" },
  { code: "KL", name: "Bar Council of Kerala" },
  { code: "MP", name: "State Bar Council of Madhya Pradesh" },
  { code: "MH", name: "Bar Council of Maharashtra & Goa" },
  { code: "MN", name: "Bar Council of Manipur" },
  { code: "ML", name: "Bar Council of Meghalaya" },
  { code: "OD", name: "Bar Council of Odisha" },
  { code: "PB", name: "Bar Council of Punjab & Haryana" },
  { code: "RJ", name: "Bar Council of Rajasthan" },
  { code: "TN", name: "Bar Council of Tamil Nadu & Puducherry" },
  { code: "TS", name: "Bar Council of Telangana" },
  { code: "TR", name: "Bar Council of Tripura" },
  { code: "UP", name: "Bar Council of Uttar Pradesh" },
  { code: "UK", name: "Bar Council of Uttarakhand" },
  { code: "WB", name: "Bar Council of West Bengal" },
] as const;

export const PRACTICE_AREAS = [
  { key: "CRIMINAL", label: "Criminal & Bail" },
  { key: "FAMILY", label: "Family & Divorce" },
  { key: "DOMESTIC_VIOLENCE", label: "Domestic Violence" },
  { key: "PROPERTY", label: "Property & Land" },
  { key: "CIVIL", label: "Civil Disputes" },
  { key: "CONSUMER", label: "Consumer" },
  { key: "CYBER", label: "Cyber Crime" },
  { key: "LABOUR", label: "Labour & Employment" },
  { key: "CHEQUE_BOUNCE", label: "Cheque Bounce" },
  { key: "MOTOR_ACCIDENT", label: "Motor Accident Claims" },
  { key: "TENANCY", label: "Rent & Tenancy" },
  { key: "SERVICE", label: "Service Matters" },
  { key: "TAX", label: "Tax" },
  { key: "CONSTITUTIONAL", label: "Writs & Constitutional" },
] as const;

export const COURTS = [
  { key: "DISTRICT", label: "District & Sessions Court" },
  { key: "MAGISTRATE", label: "Magistrate Court" },
  { key: "HIGH_COURT", label: "High Court" },
  { key: "SUPREME_COURT", label: "Supreme Court" },
  { key: "FAMILY_COURT", label: "Family Court" },
  { key: "CONSUMER_COMMISSION", label: "Consumer Commission" },
  { key: "LABOUR_COURT", label: "Labour Court / Tribunal" },
  { key: "TRIBUNAL", label: "Other Tribunals" },
] as const;

export const LAWYER_LANGUAGES = SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: l.englishName }));

export const GENDERS = [
  { key: "FEMALE", label: "Woman" },
  { key: "MALE", label: "Man" },
  { key: "OTHER", label: "Other" },
] as const;

export const DOCUMENT_TYPES = [
  {
    key: "ENROLMENT_CERTIFICATE",
    label: "Bar Council enrolment certificate",
    hint: "The certificate issued by your State Bar Council.",
    imagesOnly: false,
  },
  {
    key: "PRACTICE_CERTIFICATE",
    label: "Certificate of Practice or Bar ID card",
    hint: "Shows you are currently entitled to practise.",
    imagesOnly: false,
  },
  {
    key: "PHOTO_ID",
    label: "Photo ID",
    hint: "PAN, voter ID, or a MASKED Aadhaar (first 8 digits hidden — download it from the UIDAI site). Never upload a full Aadhaar.",
    imagesOnly: false,
  },
  {
    key: "SELFIE_WITH_ID",
    label: "Selfie holding your Bar ID",
    hint: "A clear photo of your face next to your Bar Council ID, so nobody can use someone else's certificate.",
    imagesOnly: true,
  },
] as const;

export type BarCouncilCode = (typeof BAR_COUNCILS)[number]["code"];
export type PracticeAreaKey = (typeof PRACTICE_AREAS)[number]["key"];
export type CourtKey = (typeof COURTS)[number]["key"];
export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number]["key"];

export const BAR_COUNCIL_CODES = BAR_COUNCILS.map((b) => b.code) as [BarCouncilCode, ...BarCouncilCode[]];
export const PRACTICE_AREA_KEYS = PRACTICE_AREAS.map((p) => p.key) as [PracticeAreaKey, ...PracticeAreaKey[]];
export const COURT_KEYS = COURTS.map((c) => c.key) as [CourtKey, ...CourtKey[]];
export const LANGUAGE_CODES = LAWYER_LANGUAGES.map((l) => l.code) as [string, ...string[]];
export const DOCUMENT_TYPE_KEYS = DOCUMENT_TYPES.map((d) => d.key) as [DocumentTypeKey, ...DocumentTypeKey[]];

export const label = {
  practiceArea: (k: string) => PRACTICE_AREAS.find((p) => p.key === k)?.label ?? k,
  court: (k: string) => COURTS.find((c) => c.key === k)?.label ?? k,
  language: (c: string) => LAWYER_LANGUAGES.find((l) => l.code === c)?.label ?? c,
  barCouncil: (c: string) => BAR_COUNCILS.find((b) => b.code === c)?.name ?? c,
};

/** Optional distance filters. The default is all distances, nearest first. */
export const RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;
/** Verification lapses after a year and must be renewed. */
export const VERIFICATION_VALID_DAYS = 365;
/** Max PENDING requests a citizen may have open at once. */
export const MAX_PENDING_REQUESTS = 3;
