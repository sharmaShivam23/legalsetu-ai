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
      <p className="text-xs font-medium text-slate-500">Likely applicable provisions</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.section}
            className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
          >
            {tag.act} §{tag.section} — {tag.label}
          </span>
        ))}
        {showIntimidation && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {CRIMINAL_INTIMIDATION_TAG.act} §{CRIMINAL_INTIMIDATION_TAG.section} —{" "}
            {CRIMINAL_INTIMIDATION_TAG.label} (suggested — confirm)
          </span>
        )}
        {requiresManualReview && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Section requires manual legal review
          </span>
        )}
      </div>
    </div>
  );
}
