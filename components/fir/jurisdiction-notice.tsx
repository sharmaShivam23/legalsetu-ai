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
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/80 dark:border-sky-500/30 bg-sky-50/80 dark:bg-sky-500/10 p-3.5 text-xs text-sky-900 dark:text-sky-200 shadow-xs transition-colors duration-200">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
      <p className="leading-relaxed">{notice.message}</p>
    </div>
  );
}
