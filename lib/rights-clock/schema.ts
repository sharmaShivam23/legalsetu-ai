// ==========================================================
// LegalSetu — Rights Clock: request validation (shared by the
// API routes and the client form, so both reject the same input)
// ==========================================================

import { z } from "zod";
import { isISODate } from "./dates";

const isoDate = z.string().refine((v) => isISODate(v), { message: "Use a valid date (YYYY-MM-DD)." });

/**
 * Free text lands in court-filing PDFs and emails: control characters
 * and angle brackets are replaced, and whitespace collapsed.
 */
export function cleanText(value: string): string {
  return Array.from(value)
    .map((ch) => (ch.charCodeAt(0) < 0x20 || ch === "<" || ch === ">" ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
const optionalIsoDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const t = cleanText(v ?? "");
      return t ? t.slice(0, max) : null;
    });
const triState = z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN");

/** The facts the engine needs — no personal details. */
export const engineInputSchema = z.object({
  arrestDate: isoDate,
  firstRemandDate: optionalIsoDate,
  sections: z
    .array(z.string().trim().max(40))
    .max(25, "Enter at most 25 sections.")
    .transform((list) => list.filter(Boolean)),
  otherLawCharges: z.boolean().default(false),
  chargesheetFiledOn: optionalIsoDate,
  priorConviction: triState,
  otherPendingCases: triState,
  inCustody: z.boolean().default(true),
});

/** A saved tracker: engine facts plus who it is for. */
export const trackerSchema = engineInputSchema.extend({
  personName: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, "Enter the person's name.").max(120)),
  relationship: optionalText(60),
  policeStation: optionalText(160),
  firNumber: optionalText(60),
  courtName: optionalText(160),
  prisonName: optionalText(160),
  remindersEnabled: z.boolean().default(true),
  /** Link to an existing case; omitted → a new case is created. */
  caseId: z.string().uuid().nullable().optional(),
});

export const trackerUpdateSchema = trackerSchema.partial();

export type EngineInputBody = z.infer<typeof engineInputSchema>;
export type TrackerBody = z.infer<typeof trackerSchema>;
