"use client";

import dynamic from "next/dynamic";

/** Client-only map (Leaflet needs `window`). */
export const LawyerMap = dynamic(() => import("./lawyer-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-2xl border border-borderCustom bg-card text-xs text-textSecondary">
      Loading map…
    </div>
  ),
});

export type { MapPin } from "./lawyer-map";
