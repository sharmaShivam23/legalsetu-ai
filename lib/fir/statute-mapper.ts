// ==========================================================
// LegalSetu — FIR Wizard: statutory section auto-tagging
// Mirrors FIR_Feature_Implementation_Phases.md § Phase 2.2
//
// NOTE: Only the sections explicitly confirmed in the product
// spec are mapped. Everything else returns a "manual review"
// flag rather than guessing a section number — an incorrect
// statute citation on a real police complaint is worse than
// no citation at all.
// ==========================================================

import type { IncidentType } from "./types";

export interface StatuteTag {
  act: "BNS";
  section: string;
  label: string;
}

const STATUTE_MAP: Partial<Record<IncidentType, StatuteTag[]>> = {
  Theft: [{ act: "BNS", section: "303", label: "Theft / Larceny" }],
  "Cybercrime / Fraud": [
    { act: "BNS", section: "318", label: "Cheating & Cyber Fraud" },
  ],
  "Physical Assault": [
    { act: "BNS", section: "115", label: "Voluntarily Causing Hurt / Assault" },
  ],
  Extortion: [{ act: "BNS", section: "308", label: "Extortion" }],
};

// Criminal Intimidation (BNS 351) is not tied to a single incident type in
// the wizard — surfaced separately when the narrative signals a threat.
export const CRIMINAL_INTIMIDATION_TAG: StatuteTag = {
  act: "BNS",
  section: "351",
  label: "Criminal Intimidation",
};

export interface StatuteMapResult {
  tags: StatuteTag[];
  requiresManualReview: boolean;
}

export function mapIncidentToStatutes(
  incidentType?: IncidentType
): StatuteMapResult {
  if (!incidentType || !STATUTE_MAP[incidentType]) {
    return { tags: [], requiresManualReview: true };
  }
  return { tags: STATUTE_MAP[incidentType]!, requiresManualReview: false };
}

/** Simple heuristic: surface BNS 351 as an additional possible tag when the
 * narrative text contains common intimidation/threat language. This is a
 * suggestion for the user to confirm, never auto-applied. */
export function suggestIntimidationTag(narrative?: string): boolean {
  if (!narrative) return false;
  return /\b(threat(en(ed|ing)?)?|intimidat|warned me|said he would|said she would)\b/i.test(
    narrative
  );
}
