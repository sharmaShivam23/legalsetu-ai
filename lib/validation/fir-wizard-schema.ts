// ==========================================================
// LegalSetu — FIR Wizard: Zod schemas
//
// This is intentionally separate from `firDraftSchema` in
// lib/validation/schemas.ts (which matches the flat FIRDraft
// columns and is still used by legacy/simple callers). This
// schema matches the richer nested wizard shape and is what
// gets persisted into FIRDraft.formData.
// ==========================================================

import { z } from "zod";
import { INCIDENT_TYPES } from "@/lib/fir/types";

export const lossItemSchema = z.object({
  description: z.string().min(1).max(300),
  value: z.number().nonnegative().optional(),
});

export const witnessEntrySchema = z.object({
  name: z.string().min(1).max(150),
  contact: z.string().max(150).optional(),
});

// Every field optional at the schema level — the wizard persists
// partial progress. Real "is this ready to submit" checks live in
// lib/fir/completeness.ts, not here.
export const firWizardDataSchema = z.object({
  incidentType: z.enum(INCIDENT_TYPES).optional(),

  incidentDateTime: z.string().datetime().optional(),
  discoveryDateTime: z.string().datetime().optional(),
  delayReason: z.string().max(500).optional(),

  address: z.string().max(500).optional(),
  district: z.string().max(150).optional(),
  state: z.string().max(150).optional(),
  landmark: z.string().max(300).optional(),
  pincode: z.string().max(10).optional(),
  preferredPoliceStation: z.string().max(200).optional(),

  accusedUnknown: z.boolean().optional(),
  accusedName: z.string().max(300).optional(),
  accusedDescription: z.string().max(1000).optional(),
  vehicleNumber: z.string().max(50).optional(),
  accusedContact: z.string().max(300).optional(),

  lossItems: z.array(lossItemSchema).max(50).optional(),
  transactionIds: z.string().max(1000).optional(),
  injuryDetails: z.string().max(2000).optional(),

  narrative: z.string().max(8000).optional(),

  witnesses: z.array(witnessEntrySchema).max(20).optional(),
  evidenceRefs: z.string().max(2000).optional(),

  confirmed: z.boolean().optional(),
});

export type FirWizardDataInput = z.infer<typeof firWizardDataSchema>;

// Payload for creating/updating a draft — wraps the wizard data plus
// an optional caseId to link it into Case Management.
export const firWizardSaveSchema = z.object({
  caseId: z.string().uuid().optional(),
  formData: firWizardDataSchema,
});

export const firWizardIdParamSchema = z.object({
  id: z.string().uuid(),
});
