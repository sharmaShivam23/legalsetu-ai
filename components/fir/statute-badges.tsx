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
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-textSecondary">
        Likely applicable provisions
      </p>
      <div className="flex flex-wrap gap-1.5" data-no-translate>
        {tags.map((tag) => (
          <span
            key={tag.section}
            className="inline-flex items-center rounded-full border border-brandBlue/30 bg-brandBlue/10 px-2.5 py-1 text-xs font-medium text-brandBlue"
          >
            {tag.act} §{tag.section} — {tag.label}
          </span>
        ))}

        {showIntimidation && (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            {CRIMINAL_INTIMIDATION_TAG.act} §{CRIMINAL_INTIMIDATION_TAG.section} —{" "}
            {CRIMINAL_INTIMIDATION_TAG.label} (suggested)
          </span>
        )}

        {requiresManualReview && (
          <span className="inline-flex items-center rounded-full border border-borderCustom bg-canvas px-2.5 py-1 text-xs font-medium text-textSecondary">
            Section requires manual legal review
          </span>
        )}
      </div>
    </div>
  );
}