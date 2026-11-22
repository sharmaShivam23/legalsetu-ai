// ==========================================================
// GET|POST /api/rights-clock/reminders — daily reminder job
// ----------------------------------------------------------
// Call once a day from any scheduler (Vercel Cron, GitHub
// Actions, a server crontab):
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://<host>/api/rights-clock/reminders
//
// Disabled (503) unless CRON_SECRET is set, so a deployment that
// forgot to configure it can never be triggered by a stranger.
// Safe to run more than once a day: reminders are de-duplicated
// per tracker by key (see lib/rights-clock/reminders.ts).
// ==========================================================

import { NextRequest } from "next/server";
import { emailBaseUrl } from "@/lib/email/links";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { sendEmail } from "@/lib/email/mailer";
import { buildRightsClockReminderEmail } from "@/lib/email/templates";
import { computeForTracker, syncCaseFromTracker } from "@/lib/rights-clock/service";
import { dueReminders } from "@/lib/rights-clock/reminders";
import { formatDate, todayInIndia } from "@/lib/rights-clock/dates";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 200;

function authorised(req: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function whenText(daysUntil: number, date: string): string {
  if (daysUntil < 0) return `${formatDate(date)} — ${-daysUntil} day${daysUntil === -1 ? "" : "s"} ago, act now`;
  if (daysUntil === 0) return `${formatDate(date)} — today`;
  if (daysUntil === 1) return `${formatDate(date)} — tomorrow`;
  return `${formatDate(date)} — in ${daysUntil} days`;
}

async function run(req: NextRequest) {
  const ok = authorised(req);
  if (ok === null) return apiError("DISABLED", "Reminders are not configured (CRON_SECRET is not set).", 503);
  if (!ok) return apiError("UNAUTHORIZED", "Invalid reminder job credentials.", 401);

  const today = todayInIndia();
  const appUrl = emailBaseUrl();
  let scanned = 0;
  let emailed = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.custodyTracker.findMany({
      where: { remindersEnabled: true, inCustody: true },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const tracker of batch) {
      scanned++;
      try {
        const result = computeForTracker(tracker, today);
        // Keep the case's next action current even on days with no email.
        await syncCaseFromTracker(tracker, result);

        const due = dueReminders(result, tracker.remindersSent, today);
        if (due.length === 0 || !tracker.user.email) continue;

        const mail = buildRightsClockReminderEmail({
          name: tracker.user.name ?? undefined,
          personName: tracker.personName,
          items: due.map((d) => ({
            label: d.milestone.label,
            when: whenText(d.daysUntil, d.milestone.date),
            urgent: d.bucket === "T-0",
          })),
          nextAction: result.nextAction?.text,
          trackerUrl: `${appUrl}/dashboard/rights-clock/${tracker.id}`,
        });
        const sent = await sendEmail({ to: tracker.user.email, ...mail });

        // Dev-mode (SMTP not configured) counts as handled so the log is
        // not flooded on every run; a real SMTP failure retries next run.
        if (sent.delivered || sent.devMode) {
          await prisma.custodyTracker.update({
            where: { id: tracker.id },
            data: { remindersSent: { push: due.map((d) => d.key) } },
          });
          emailed++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        logger.error("Rights Clock reminder failed", { trackerId: tracker.id, errorType: String(err).slice(0, 200) });
      }
    }
    if (batch.length < BATCH) break;
  }

  logger.info("Rights Clock reminder run complete", { today, scanned, emailed, failed });
  return apiSuccess({ today, scanned, emailed, failed });
}

export const GET = run;
export const POST = run;
