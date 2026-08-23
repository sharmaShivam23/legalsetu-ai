// ==========================================================
// LegalSetu — FIR Wizard: derive legacy flat columns
//
// Keeps FIRDraft's original flat fields (location, peopleInvolved,
// description, etc.) populated as human-readable summaries of the
// structured formData, so any existing code reading those columns
// (e.g. the old validate route, dashboards) keeps working unchanged.
// ==========================================================

import type { FIRWizardData } from "./types";

export function summarizeWizardData(data: FIRWizardData) {
  const location = [data.address, data.landmark, data.district, data.state, data.pincode]
    .filter(Boolean)
    .join(", ");

  const peopleInvolved = data.accusedUnknown
    ? "Unknown accused"
    : [data.accusedName, data.accusedDescription, data.vehicleNumber, data.accusedContact]
        .filter(Boolean)
        .join(" | ");

  const evidence = [
    data.transactionIds ? `Transaction ID(s): ${data.transactionIds}` : null,
    data.evidenceRefs,
  ]
    .filter(Boolean)
    .join("\n");

  const witnesses = (data.witnesses ?? [])
    .map((w) => `${w.name}${w.contact ? ` (${w.contact})` : ""}`)
    .join(", ");

  const additionalDetails = [
    data.lossItems && data.lossItems.length > 0
      ? `Loss items: ${data.lossItems.map((i) => `${i.description}${i.value ? ` (₹${i.value})` : ""}`).join("; ")}`
      : null,
    data.injuryDetails ? `Injury: ${data.injuryDetails}` : null,
    data.delayReason ? `Delay reason: ${data.delayReason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    incidentType: data.incidentType,
    incidentDate: data.incidentDateTime ? new Date(data.incidentDateTime) : undefined,
    location: location || undefined,
    peopleInvolved: peopleInvolved || undefined,
    description: data.narrative,
    evidence: evidence || undefined,
    witnesses: witnesses || undefined,
    additionalDetails: additionalDetails || undefined,
  };
}
