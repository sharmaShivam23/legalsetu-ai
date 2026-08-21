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
    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{notice.message}</p>
    </div>
  );
}
