// ==========================================================
// LegalSetu — FIR Wizard: PDF exporter
// Mirrors FIR_Feature_Implementation_Phases.md § Phase 3
//
// Client-side only (jsPDF) — no server round-trip needed since
// the data already lives in the browser at review time.
// ==========================================================

import { jsPDF } from "jspdf";
import type { FIRWizardData } from "./types";
import { mapIncidentToStatutes } from "./statute-mapper";

const BNSS_NOTICE = [
  "Notice under Section 173(1)(ii) of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023:",
  "Electronic communications submitted to police authorities must be signed in person or physically authenticated within 3 days to be formally taken on record as a registered e-FIR. This document serves as a structured assistance draft and does not replace formal verification at the jurisdictional police station or before a competent legal authority.",
].join(" ");

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4 mm

function addWrappedText(
  doc: jsPDF,
  text: string,
  y: number,
  fontSize: number,
  maxWidth = PAGE_WIDTH - MARGIN * 2
): number {
  doc.setFontSize(fontSize);
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, MARGIN, y);
  return y + lines.length * (fontSize * 0.4) + 4;
}

export function generateFirPdf(data: FIRWizardData, applicantName?: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 20;

  // Header
  doc.setFont("helvetica", "bold");
  y = addWrappedText(doc, "To,", y, 11);
  y = addWrappedText(doc, "The Station House Officer (SHO)", y, 11);
  y = addWrappedText(
    doc,
    `${data.preferredPoliceStation || "[Police Station Name]"}, ${data.district || "[District]"}, ${data.state || "[State]"}`,
    y,
    11
  );
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Subject: Complaint regarding " + (data.incidentType || "[Incident Type]"), MARGIN, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  y = addWrappedText(doc, "Respected Sir/Madam,", y, 11);
  y = addWrappedText(
    doc,
    `I, ${applicantName || "[Applicant Name]"}, wish to lodge a complaint regarding the following incident.`,
    y,
    11
  );
  y += 2;

  // Statement of facts
  doc.setFont("helvetica", "bold");
  doc.text("Statement of Facts", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");

  const facts: Array<[string, string | undefined]> = [
    ["Date/Time of Incident", data.incidentDateTime ? new Date(data.incidentDateTime).toLocaleString("en-IN") : undefined],
    ["Discovered On", data.discoveryDateTime ? new Date(data.discoveryDateTime).toLocaleString("en-IN") : undefined],
    ["Reason for Delay", data.delayReason],
    ["Location", [data.address, data.landmark, data.district, data.state, data.pincode].filter(Boolean).join(", ")],
    [
      "Accused/Suspect",
      data.accusedUnknown
        ? "Unknown at this time"
        : [data.accusedName, data.accusedDescription, data.vehicleNumber, data.accusedContact].filter(Boolean).join(" | "),
    ],
    [
      "Loss / Property",
      data.lossItems && data.lossItems.length > 0
        ? data.lossItems.map((i) => `${i.description}${i.value ? ` (approx. ₹${i.value})` : ""}`).join("; ")
        : undefined,
    ],
    ["Transaction ID(s)", data.transactionIds],
    ["Injury Details", data.injuryDetails],
  ];

  for (const [label, value] of facts) {
    if (!value) continue;
    y = addWrappedText(doc, `${label}: ${value}`, y, 10);
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  }

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text("Narrative", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  y = addWrappedText(doc, data.narrative || "[No narrative provided]", y, 10);

  if (data.witnesses && data.witnesses.length > 0) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Witnesses", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const w of data.witnesses) {
      y = addWrappedText(doc, `${w.name}${w.contact ? ` — ${w.contact}` : ""}`, y, 10);
    }
  }

  if (data.evidenceRefs) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Evidence Referenced", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    y = addWrappedText(doc, data.evidenceRefs, y, 10);
  }

  // Statutory citations
  const { tags, requiresManualReview } = mapIncidentToStatutes(data.incidentType);
  if (tags.length > 0 || requiresManualReview) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Applicable Provisions (for reference)", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    if (tags.length > 0) {
      y = addWrappedText(
        doc,
        tags.map((t) => `${t.act} Section ${t.section} — ${t.label}`).join("; "),
        y,
        10
      );
    } else {
      y = addWrappedText(
        doc,
        "Applicable section(s) require manual review by the investigating officer or legal counsel.",
        y,
        10
      );
    }
  }

  y += 4;
  doc.setFont("helvetica", "normal");
  y = addWrappedText(
    doc,
    "I request that this complaint be registered and appropriate action taken under the applicable law.",
    y,
    11
  );
  y += 6;
  y = addWrappedText(doc, `Yours faithfully,\n${applicantName || "[Applicant Name]"}`, y, 11);

  // BNSS compliance banner — always on its own space, boxed
  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 8;
  }

  doc.setDrawColor(180, 130, 20);
  doc.setFillColor(255, 247, 224);
  const boxHeight = 28;
  doc.roundedRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, boxHeight, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 80, 10);
  const noticeLines: string[] = doc.splitTextToSize(BNSS_NOTICE, PAGE_WIDTH - MARGIN * 2 - 6);
  doc.text(noticeLines, MARGIN + 3, y + 6);
  doc.setTextColor(0, 0, 0);

  return doc;
}

export function downloadFirPdf(data: FIRWizardData, applicantName?: string) {
  const doc = generateFirPdf(data, applicantName);
  const filename = `FIR-Draft-${(data.incidentType || "complaint").replace(/\s+/g, "-")}-${Date.now()}.pdf`;
  doc.save(filename);
}
