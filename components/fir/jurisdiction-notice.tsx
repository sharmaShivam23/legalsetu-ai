"use client";

import { MapPin } from "lucide-react";
import { getJurisdictionNotice } from "@/lib/fir/jurisdiction";
import type { FIRWizardData } from "@/lib/fir/types";

export function JurisdictionNotice({
  data,
}: {
  data: Pick<FIRWizardData, "district" | "state" | "preferredPoliceStation">;
}) {
  const notice = getJurisdictionNotice(data);
  if (!notice.showZeroFirNotice) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-brandBlue/30 bg-brandBlue/5 p-3.5 text-xs text-textPrimary">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" />
      <p className="leading-relaxed">{notice.message}</p>
    </div>
  );
}
