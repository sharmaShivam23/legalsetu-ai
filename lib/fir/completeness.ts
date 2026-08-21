// ==========================================================
// LegalSetu — FIR Wizard: weighted completeness score
// Mirrors FIR_Feature_Implementation_Phases.md § Phase 2.1
// ==========================================================

import type { FIRWizardData } from "./types";

const NARRATIVE_MIN_WORDS = 100;

export interface CompletenessBreakdown {
  key: string;
  label: string;
  weight: number; // percentage points available
  earned: number; // percentage points earned
  complete: boolean;
}

export interface CompletenessResult {
  score: number; // 0-100, rounded
  breakdown: CompletenessBreakdown[];
  missingFields: string[];
}

function wordCount(text?: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeCompleteness(data: FIRWizardData): CompletenessResult {
  const breakdown: CompletenessBreakdown[] = [];
  const missingFields: string[] = [];

  // Date & Time — 15%
  const hasDateTime = Boolean(data.incidentDateTime);
  breakdown.push({
    key: "datetime",
    label: "Date & Time Details",
    weight: 15,
    earned: hasDateTime ? 15 : 0,
    complete: hasDateTime,
  });
  if (!hasDateTime) missingFields.push("Date/time of incident");

  // Location & Jurisdiction — 15%
  const hasLocation = Boolean(data.address && data.district && data.state);
  breakdown.push({
    key: "location",
    label: "Location & Jurisdiction",
    weight: 15,
    earned: hasLocation ? 15 : 0,
    complete: hasLocation,
  });
  if (!hasLocation) missingFields.push("Full incident location (address, district, state)");

  // Accused Details — 10%
  const hasAccused = Boolean(
    data.accusedUnknown ||
      data.accusedName ||
      data.accusedDescription ||
      data.vehicleNumber
  );
  breakdown.push({
    key: "accused",
    label: "Accused Details",
    weight: 10,
    earned: hasAccused ? 10 : 0,
    complete: hasAccused,
  });
  if (!hasAccused) missingFields.push("Accused/suspect details (or mark as unknown)");

  // Loss / Injury Metrics — 15%
  const hasLossOrInjury = Boolean(
    (data.lossItems && data.lossItems.length > 0) || data.injuryDetails
  );
  breakdown.push({
    key: "loss-injury",
    label: "Loss / Injury Metrics",
    weight: 15,
    earned: hasLossOrInjury ? 15 : 0,
    complete: hasLossOrInjury,
  });
  if (!hasLossOrInjury) missingFields.push("Loss, property, or injury details");

  // Narrative Depth (>100 words) — 35%
  const words = wordCount(data.narrative);
  const narrativeRatio = Math.min(1, words / NARRATIVE_MIN_WORDS);
  const narrativeEarned = Math.round(narrativeRatio * 35);
  breakdown.push({
    key: "narrative",
    label: "Narrative Depth (>100 words)",
    weight: 35,
    earned: narrativeEarned,
    complete: words >= NARRATIVE_MIN_WORDS,
  });
  if (words < NARRATIVE_MIN_WORDS) {
    missingFields.push(
      words === 0
        ? "Incident narrative"
        : `Narrative needs ${NARRATIVE_MIN_WORDS - words} more word(s) (currently ${words})`
    );
  }

  // Witnesses / Evidence References — 10%
  const hasWitnessOrEvidence = Boolean(
    (data.witnesses && data.witnesses.length > 0) || data.evidenceRefs
  );
  breakdown.push({
    key: "witnesses-evidence",
    label: "Witnesses / Evidence References",
    weight: 10,
    earned: hasWitnessOrEvidence ? 10 : 0,
    complete: hasWitnessOrEvidence,
  });
  if (!hasWitnessOrEvidence) missingFields.push("Witness or evidence reference (optional but recommended)");

  const score = breakdown.reduce((sum, b) => sum + b.earned, 0);

  return { score: Math.min(100, Math.round(score)), breakdown, missingFields };
}
