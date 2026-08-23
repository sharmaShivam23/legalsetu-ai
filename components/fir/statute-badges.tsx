"use client";

import type { IncidentType } from "@/lib/fir/types";
import { mapIncidentToStatutes, suggestIntimidationTag, CRIMINAL_INTIMIDATION_TAG } from "@/lib/fir/statute-mapper";

export function StatuteBadges({
  incidentType,
  narrative,
}: {
  incidentType?: IncidentType;
  narrative?: string;
}) {
  const { tags, requiresManualReview } = mapIncidentToStatutes(incidentType);
  const showIntimidation = suggestIntimidationTag(narrative);

  if (tags.length === 0 && !requiresManualReview && !showIntimidation) return null;

  return (
    <div className="space-y-1.5 transition-colors duration-200">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Likely applicable provisions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.section}
            className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-800 dark:text-blue-300 shadow-xs"
          >
            {tag.act} §{tag.section} — {tag.label}
          </span>
        ))}
        
        {showIntimidation && (
          <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 shadow-xs">
            {CRIMINAL_INTIMIDATION_TAG.act} §{CRIMINAL_INTIMIDATION_TAG.section} —{" "}
            {CRIMINAL_INTIMIDATION_TAG.label} (suggested)
          </span>
        )}

        {requiresManualReview && (
          <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400">
            Section requires manual legal review
          </span>
        )}
      </div>
    </div>
  );
}