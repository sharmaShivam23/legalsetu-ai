"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";
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
    <Card>
      <CardContent className="space-y-4 p-6">
        <Badge variant="warning">Draft / Assistance Document</Badge>
        <h2 className="text-lg font-semibold text-navy-900">FIR Draft Summary</h2>

        <CompletenessMeter result={completeness} />

        {completeness.missingFields.length > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Consider adding:</p>
              <ul className="mt-1 list-disc pl-4">
                {completeness.missingFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            All key fields are complete.
          </div>
        )}

        <StatuteBadges incidentType={data.incidentType} narrative={data.narrative} />

        <JurisdictionNotice data={data} />

        <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
          <p className="mb-2 font-medium text-navy-900">Draft contents</p>
          {data.narrative && <p className="mb-1"><span className="font-medium">Narrative: </span>{data.narrative}</p>}
          {data.address && (
            <p className="mb-1">
              <span className="font-medium">Location: </span>
              {[data.address, data.landmark, data.district, data.state, data.pincode].filter(Boolean).join(", ")}
            </p>
          )}
          {(data.accusedName || data.accusedUnknown) && (
            <p className="mb-1">
              <span className="font-medium">Accused: </span>
              {data.accusedUnknown ? "Unknown" : [data.accusedName, data.accusedDescription].filter(Boolean).join(" — ")}
            </p>
          )}
        </div>

        <Button variant="brand" onClick={() => downloadFirPdf(data, applicantName)}>
          <Download className="mr-1.5 h-4 w-4" />
          Download PDF draft
        </Button>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠️ {BNSS_NOTICE}
        </div>

        <p className="text-xs text-slate-400">
          This is a draft assistance document, not an officially filed FIR.
          Please review it with the appropriate police station or legal aid
          service before submission.
        </p>
      </CardContent>
    </Card>
  );
}
