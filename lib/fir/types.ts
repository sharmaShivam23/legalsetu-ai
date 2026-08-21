// ==========================================================
// LegalSetu — FIR Wizard: shared types
// ==========================================================

export const INCIDENT_TYPES = [
  "Theft",
  "Cybercrime / Fraud",
  "Physical Assault",
  "Property Damage",
  "Domestic Violence",
  "Extortion",
  "Other",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export interface LossItem {
  description: string;
  value?: number;
}

export interface WitnessEntry {
  name: string;
  contact?: string;
}

/**
 * Full structured wizard state — persisted as FIRDraft.formData (Json).
 * Every field is optional at the type level because the wizard is filled
 * in incrementally; completeness.ts is the source of truth for what counts
 * as "done".
 */
export interface FIRWizardData {
  // Step 1 — Incident Categorization
  incidentType?: IncidentType;

  // Step 2 — Temporal Details
  incidentDateTime?: string; // ISO datetime
  discoveryDateTime?: string; // ISO datetime
  delayReason?: string;

  // Step 3 — Location & Territorial Jurisdiction
  address?: string;
  district?: string;
  state?: string;
  landmark?: string;
  pincode?: string;
  preferredPoliceStation?: string;

  // Step 4 — Accused / Suspect Details
  accusedUnknown?: boolean;
  accusedName?: string;
  accusedDescription?: string;
  vehicleNumber?: string;
  accusedContact?: string;

  // Step 5 — Loss, Harm & Property Inventory
  lossItems?: LossItem[];
  transactionIds?: string;
  injuryDetails?: string;

  // Step 6 — Chronological Incident Narrative
  narrative?: string;

  // Step 7 — Witness Information & Evidence References
  witnesses?: WitnessEntry[];
  evidenceRefs?: string;

  // Step 8 — Final Review
  confirmed?: boolean;
}

export const WIZARD_STEP_KEYS = [
  "incident-type",
  "datetime",
  "location",
  "accused",
  "loss-harm",
  "narrative",
  "witnesses",
  "review",
] as const;

export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

export const WIZARD_STEP_LABELS: Record<WizardStepKey, string> = {
  "incident-type": "Incident Type",
  datetime: "Date & Time",
  location: "Location",
  accused: "Accused Details",
  "loss-harm": "Loss / Harm",
  narrative: "Narrative",
  witnesses: "Witnesses & Evidence",
  review: "Review",
};
