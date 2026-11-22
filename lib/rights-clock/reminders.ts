// ==========================================================
// LegalSetu — Rights Clock: deadline reminders (pure logic)
// ----------------------------------------------------------
// A right nobody remembers to claim is a right lost — default
// bail in particular is defeated the moment the chargesheet is
// filed before anyone applies. So each tracker emails the family
// 7 days before, 1 day before, and on the day each right arises.
//
// Idempotent by construction: each reminder has a stable key
// ("DEFAULT_BAIL_60:T-1") recorded once sent. If the daily job
// misses a run, the next run sends the most relevant pending
// reminder instead of a burst of stale ones.
// ==========================================================

import { daysBetween, type ISODate } from "./dates";
import type { Milestone, RightsClockResult } from "./engine";

export type ReminderBucket = "T-7" | "T-1" | "T-0";

export interface DueReminder {
  key: string;
  bucket: ReminderBucket;
  milestone: Milestone;
  daysUntil: number;
}

/** Milestones a family can act on. Reference-only dates (barred by §479(2)) are never reminded. */
const REMINDABLE = /^(DEFAULT_BAIL_\d+|S479_ONE_THIRD|S479_ONE_HALF|MAX_SENTENCE)$/;

/** How long after a milestone a missed "on the day" reminder is still worth sending. */
const LATE_GRACE_DAYS = 3;

export function bucketFor(daysUntil: number): ReminderBucket | null {
  if (daysUntil < -LATE_GRACE_DAYS) return null;
  if (daysUntil <= 0) return "T-0";
  if (daysUntil <= 1) return "T-1";
  if (daysUntil <= 7) return "T-7";
  return null;
}

export function dueReminders(result: RightsClockResult, alreadySent: string[], today: ISODate): DueReminder[] {
  if (result.inputErrors.length) return [];
  const sent = new Set(alreadySent);
  const due: DueReminder[] = [];
  for (const m of result.milestones) {
    if (!REMINDABLE.test(m.key) || m.certainty === "REFERENCE") continue;
    const daysUntil = daysBetween(today, m.date);
    const bucket = bucketFor(daysUntil);
    if (!bucket) continue;
    const key = `${m.key}@${m.date}:${bucket}`;
    // A later bucket supersedes earlier ones — never send T-7 after T-1.
    const laterSent = (["T-0", "T-1"] as ReminderBucket[])
      .slice(0, bucket === "T-7" ? 2 : bucket === "T-1" ? 1 : 0)
      .some((b) => sent.has(`${m.key}@${m.date}:${b}`));
    if (sent.has(key) || laterSent) continue;
    due.push({ key, bucket, milestone: m, daysUntil });
  }
  return due;
}
