// ==========================================================
// LegalSetu — FIR Wizard: Zero FIR jurisdiction helper
// Mirrors FIR_Feature_Implementation_Phases.md § Phase 1, Step 3
//
// A "Zero FIR" can be filed at any police station regardless of
// where the incident occurred; it is then transferred to the
// station with actual territorial jurisdiction. We surface this
// as guidance only — we never claim to determine jurisdiction
// with legal certainty.
// ==========================================================

import type { FIRWizardData } from "./types";

export interface JurisdictionNotice {
  showZeroFirNotice: boolean;
  message: string;
}

export function getJurisdictionNotice(
  data: Pick<FIRWizardData, "district" | "state" | "preferredPoliceStation">
): JurisdictionNotice {
  const hasFullLocation = Boolean(data.district && data.state);
  const hasPreferredStation = Boolean(data.preferredPoliceStation);

  if (!hasFullLocation || !hasPreferredStation) {
    return {
      showZeroFirNotice: true,
      message:
        "If you're unsure which police station has jurisdiction over this incident, you can file a Zero FIR at any police station — it will be transferred to the correct jurisdiction. Confirm the exact station with the officer on duty.",
    };
  }

  return {
    showZeroFirNotice: false,
    message: "",
  };
}
