"use client";

import { CheckCircle2, AlertTriangle, Download, FileSignature, ShieldAlert } from "lucide-react";
import { CompletenessMeter } from "./completeness-meter";
import { StatuteBadges } from "./statute-badges";
import { JurisdictionNotice } from "./jurisdiction-notice";
import { downloadFirPdf } from "@/lib/fir/pdf-generator";
import type { FIRWizardData } from "@/lib/fir/types";
import type { CompletenessResult } from "@/lib/fir/completeness";

const BNSS_NOTICE =
  "Notice under Section 173(1)(ii) of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023: electronic communications submitted to police authorities must be signed in person or physically authenticated within 3 days to be formally taken on record as a registered e-FIR. This document serves as a structured assistance draft and does not replace formal verification at the jurisdictional police station or before a competent legal authority.";

export function FirDraftPreview({
  data,
  completeness,
  applicantName,
}: {
  data: FIRWizardData;
  completeness: CompletenessResult;
  applicantName?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-textPrimary">Your draft is ready</p>
          <p className="mt-0.5 text-xs leading-relaxed text-textSecondary">
            Review every detail below, then download it as a PDF to take with
            you.
          </p>
        </div>
      </div>

      <CompletenessMeter result={completeness} />

      {completeness.missingFields.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-textPrimary">Consider adding:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-textSecondary">
              {completeness.missingFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-sm text-textPrimary">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          All key fields are complete.
        </div>
      )}

      <StatuteBadges incidentType={data.incidentType} narrative={data.narrative} />

      <JurisdictionNotice data={data} />

      {/* Document-styled preview: a paper-like card so this reads as
          the actual complaint, not another form summary. */}
      <div className="overflow-hidden rounded-2xl border border-borderCustom shadow-sm">
        <div className="flex items-center gap-2 border-b border-borderCustom bg-canvas px-5 py-3">
          <FileSignature className="h-4 w-4 text-brandBlue" />
          <span className="text-xs font-bold uppercase tracking-wide text-textSecondary">
            Draft contents
          </span>
        </div>
        <div className="space-y-3 bg-card p-5 text-sm leading-relaxed text-textPrimary">
          {data.narrative && (
            <p>
              <span className="font-semibold">Narrative: </span>
              <span data-no-translate>{data.narrative}</span>
            </p>
          )}
          {data.address && (
            <p>
              <span className="font-semibold">Location: </span>
              <span data-no-translate>
                {[data.address, data.landmark, data.district, data.state, data.pincode].filter(Boolean).join(", ")}
              </span>
            </p>
          )}
          {(data.accusedName || data.accusedUnknown) && (
            <p>
              <span className="font-semibold">Accused: </span>
              <span data-no-translate>
                {data.accusedUnknown ? "Unknown" : [data.accusedName, data.accusedDescription].filter(Boolean).join(" — ")}
              </span>
            </p>
          )}
          {!data.narrative && !data.address && !data.accusedName && !data.accusedUnknown && (
            <p className="text-textSecondary">No details recorded yet.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => downloadFirPdf(data, applicantName)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brandBlue px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:w-auto"
      >
        <Download className="h-4 w-4" />
        Download PDF draft
      </button>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs leading-relaxed text-textPrimary">{BNSS_NOTICE}</p>
      </div>

      <p className="text-xs leading-relaxed text-textSecondary">
        This is a draft assistance document, not an officially filed FIR.
        Please review it with the appropriate police station or legal aid
        service before submission.
      </p>
    </div>
  );
}
