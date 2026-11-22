// ==========================================================
// LegalSetu — Verified Lawyer Connect: validation (client-safe)
// ==========================================================

import { z } from "zod";
import {
  BAR_COUNCIL_CODES,
  COURT_KEYS,
  DOCUMENT_TYPE_KEYS,
  LANGUAGE_CODES,
  PRACTICE_AREA_KEYS,
  RADIUS_OPTIONS_KM,
} from "./constants";

// ---------- Text hygiene ----------

/** Control characters and angle brackets out, whitespace collapsed. */
export function cleanText(value: string): string {
  return Array.from(value)
    .map((ch) => (ch.charCodeAt(0) < 0x20 && ch !== "\n" ? " " : ch === "<" || ch === ">" ? " " : ch))
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = (min: number, max: number, msg?: string) =>
  z
    .string()
    .transform((v) => cleanText(v))
    .pipe(z.string().min(min, msg ?? `Must be at least ${min} characters.`).max(max, `Must be at most ${max} characters.`));

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const t = cleanText(v ?? "");
      return t ? t.slice(0, max) : null;
    });

// ---------- Enrolment number ----------

/** "d / 1234 / 2015 " → "D/1234/2015"; dashes between parts become slashes. */
export function normaliseEnrolment(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\\|-](?=\d{4}$)/, "/")
    .replace(/^([A-Z]{1,6})[-\\|](?=[A-Z0-9])/, "$1/");
}

/**
 * State Bar Councils use different prefixes (D/, MAH/, KAR/ …), so the
 * check is structural: optional letter prefix, a serial containing a
 * digit, and a four-digit enrolment year. An admin compares it with
 * the certificate itself.
 */
export function checkEnrolment(raw: string, enrolmentYear: number, now = new Date()): string | null {
  const n = normaliseEnrolment(raw);
  const m = n.match(/^(?:[A-Z]{1,6}\/)?([A-Z0-9-]{1,12})\/(\d{4})$/);
  if (!m || !/\d/.test(m[1])) return "Enter the enrolment number exactly as on your certificate, e.g. D/1234/2015.";
  const year = Number(m[2]);
  if (year !== enrolmentYear) return `The year in the enrolment number (${year}) does not match the enrolment year (${enrolmentYear}).`;
  if (year < 1961 || year > now.getFullYear()) return "The enrolment year is not valid.";
  return null;
}

// ---------- Bar Council of India Rule 36 ----------

const PROMOTIONAL: { re: RegExp; why: string }[] = [
  { re: /\bbest\b/i, why: '"best"' },
  { re: /\bno\.?\s*1\b|\bnumber\s*one\b|#\s*1\b/i, why: '"No. 1"' },
  { re: /\btop[\s-]*(rated|ranked|lawyer|advocate|criminal|most)\b/i, why: '"top-rated"' },
  { re: /\bguarantee(d|s)?\b/i, why: "guarantees" },
  { re: /\b100\s*%|\bhundred\s+percent\b/i, why: '"100%"' },
  { re: /\bsuccess\s*(rate|ratio|record)\b/i, why: "success rates" },
  { re: /\b(never|not)\s+lost\b|\bwin(s|ning)?\s+(every|all|guaranteed)\b/i, why: "winning claims" },
  { re: /\b(cheapest|lowest\s+fees?|discount|free\s+first\s+consultation\s+offer|offer\s+valid)\b/i, why: "fee offers" },
  { re: /\b(famous|renowned|celebrity|award[-\s]?winning|leading\s+(lawyer|advocate))\b/i, why: "self-praise" },
  { re: /\bcall\s+(now|today|me)\b|\bwhatsapp\b/i, why: "solicitation" },
  { re: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/, why: "a phone number (clients contact you in-app)" },
  { re: /\bhttps?:\/\/|\bwww\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b/i, why: "links or email addresses" },
];

/**
 * Rule 36 of the BCI Rules forbids advocates from advertising or
 * soliciting work. A profile may state facts; it may not praise,
 * promise, or invite contact outside the platform.
 * Returns the reasons a text is not allowed (empty = fine).
 */
export function promotionalProblems(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(PROMOTIONAL.filter((p) => p.re.test(value)).map((p) => p.why)));
}

// ---------- Profile ----------

const currentYear = () => new Date().getFullYear();

export const lawyerProfileSchema = z
  .object({
    fullName: text(3, 120, "Enter your full name as on the enrolment certificate."),
    gender: z.enum(["FEMALE", "MALE", "OTHER"]).nullable().optional().transform((v) => v ?? null),
    barCouncil: z.enum(BAR_COUNCIL_CODES, { errorMap: () => ({ message: "Choose your State Bar Council." }) }),
    enrolmentNumber: z.string().max(40).transform(normaliseEnrolment),
    enrolmentYear: z.coerce.number().int().min(1961).max(currentYear()),
    aibeNumber: optionalText(40),
    practiceAreas: z.array(z.enum(PRACTICE_AREA_KEYS)).min(1, "Choose at least one practice area.").max(8),
    courts: z.array(z.enum(COURT_KEYS)).min(1, "Choose at least one court.").max(8),
    languages: z.array(z.enum(LANGUAGE_CODES)).min(1, "Choose at least one language.").max(10),
    bio: optionalText(300),
    officeAddress: text(8, 300, "Enter your chamber or office address."),
    city: text(2, 80, "Enter your city."),
    pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
    latitude: z.coerce.number().min(6).max(37.6),
    longitude: z.coerce.number().min(68).max(97.6),
    legalAidPanel: z.boolean().default(false),
    proBono: z.boolean().default(false),
    acceptingClients: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const enrolment = checkEnrolment(v.enrolmentNumber, v.enrolmentYear);
    if (enrolment) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["enrolmentNumber"], message: enrolment });
    const promo = promotionalProblems(v.bio);
    if (promo.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bio"],
        message: `Bar Council rules do not allow advertising in a profile. Remove: ${promo.join(", ")}.`,
      });
    }
    // A pin dropped in the sea, or across India from the PIN code, is a typo.
    if (!isInIndia(v.latitude, v.longitude)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["latitude"], message: "The office location must be in India." });
    }
  });

export type LawyerProfileInput = z.infer<typeof lawyerProfileSchema>;

/** Coarse India bounding box (mainland + islands). */
export function isInIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.6;
}

/** Fields whose change sends a verified profile back for review. */
export const IDENTITY_FIELDS = ["fullName", "barCouncil", "enrolmentNumber", "enrolmentYear"] as const;

export const documentTypeSchema = z.enum(DOCUMENT_TYPE_KEYS);

// ---------- Citizen location ----------

export const locationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("GPS"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  z.object({ source: z.literal("PINCODE"), pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code.") }),
  z.object({ source: z.literal("SEARCH"), query: text(2, 120, "Enter a city or area.") }),
]);

// ---------- Search ----------

const boolParam = z
  .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "1" || v === "true");

export const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce
    .number()
    .refine((v) => (RADIUS_OPTIONS_KM as readonly number[]).includes(v), "Unsupported radius.")
    .optional(),
  area: z.enum(PRACTICE_AREA_KEYS).optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  court: z.enum(COURT_KEYS).optional(),
  gender: z.enum(["FEMALE", "MALE", "OTHER"]).optional(),
  legalAid: boolParam,
  available: boolParam,
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export type SearchParams = z.infer<typeof searchSchema>;

// ---------- Consultations ----------

export const consultationCreateSchema = z.object({
  lawyerId: z.string().uuid(),
  category: z.enum(PRACTICE_AREA_KEYS),
  language: z.enum(LANGUAGE_CODES),
  urgency: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  summary: text(20, 1500, "Describe the problem in at least 20 characters."),
  /** Case to share with the lawyer (consent given by including it). */
  caseId: z.string().uuid().nullable().optional(),
});

export const consultationActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel", "close"]),
  reason: optionalText(300),
});

export const messageSchema = z.object({ body: text(1, 4000, "Message cannot be empty.") });

export const shareSchema = z.object({ caseId: z.string().uuid() });

export const reviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT", "SUSPEND", "REINSTATE"]),
    reason: optionalText(500),
  })
  .refine((v) => v.decision === "APPROVE" || v.decision === "REINSTATE" || Boolean(v.reason), {
    message: "Give a reason — the advocate sees it.",
    path: ["reason"],
  });

// ---------- Address at sign-up ----------

export const signupAddressSchema = z.object({
  address: z
    .string()
    .transform((v) => cleanText(v))
    .pipe(z.string().min(5, "Enter your address (house, street, area, city).").max(300)),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export type SignupAddress = z.infer<typeof signupAddressSchema>;
