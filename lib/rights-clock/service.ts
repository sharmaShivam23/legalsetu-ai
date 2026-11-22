// ==========================================================
// LegalSetu — Rights Clock: persistence glue (server-only)
// ----------------------------------------------------------
// Maps stored trackers to engine input, and keeps the linked
// Case's "next action" in step with the computed timeline so the
// existing My Cases view shows the right deadline without any
// extra work.
// ==========================================================

import type { CustodyTracker, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runRightsClock, type RightsClockInput, type RightsClockResult } from "./index";
import { todayInIndia, type ISODate } from "./dates";

export function dateToISO(d: Date | null | undefined): ISODate | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function isoToDate(iso: ISODate | null | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

export function trackerToInput(t: CustodyTracker): RightsClockInput {
  return {
    arrestDate: dateToISO(t.arrestDate)!,
    firstRemandDate: dateToISO(t.firstRemandDate),
    sections: t.sections,
    otherLawCharges: t.otherLawCharges,
    chargesheetFiledOn: dateToISO(t.chargesheetFiledOn),
    priorConviction: t.priorConviction,
    otherPendingCases: t.otherPendingCases,
    inCustody: t.inCustody,
  };
}

export function computeForTracker(t: CustodyTracker, today: ISODate = todayInIndia()): RightsClockResult {
  return runRightsClock(trackerToInput(t), today);
}

/** The tracker as the client sees it: stored facts as ISO dates, plus the live computation. */
export function serializeTracker(t: CustodyTracker, today: ISODate = todayInIndia()) {
  return {
    id: t.id,
    caseId: t.caseId,
    personName: t.personName,
    relationship: t.relationship,
    policeStation: t.policeStation,
    firNumber: t.firNumber,
    courtName: t.courtName,
    prisonName: t.prisonName,
    remindersEnabled: t.remindersEnabled,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    input: trackerToInput(t),
    result: computeForTracker(t, today),
  };
}

export type SerializedTracker = ReturnType<typeof serializeTracker>;

/**
 * Writes the computed next action onto the linked case. Escalates an
 * OPEN case when action is due now, but never touches a case the user
 * has resolved or closed.
 */
export async function syncCaseFromTracker(
  t: CustodyTracker,
  result: RightsClockResult,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  if (!t.caseId) return;
  const existing = await db.case.findFirst({
    where: { id: t.caseId, userId: t.userId },
    select: { status: true },
  });
  if (!existing || existing.status === "RESOLVED" || existing.status === "CLOSED") return;

  const next = result.nextAction;
  await db.case.update({
    where: { id: t.caseId },
    data: {
      nextAction: next ? next.text.slice(0, 300) : null,
      nextActionDue: next?.due ? isoToDate(next.due) : null,
      ...(next?.urgent && existing.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}),
    },
  });
}

/** Short case summary written when the tracker creates its own case. */
export function caseSummaryFor(t: Pick<CustodyTracker, "personName" | "sections" | "policeStation" | "firNumber">): string {
  const parts = [`Custody rights tracker for ${t.personName}.`];
  if (t.sections.length) parts.push(`Charged under BNS ${t.sections.join(", ")}.`);
  if (t.firNumber) parts.push(`FIR ${t.firNumber}${t.policeStation ? `, ${t.policeStation}` : ""}.`);
  return parts.join(" ").slice(0, 2000);
}
