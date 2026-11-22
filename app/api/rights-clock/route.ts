// ==========================================================
// GET  /api/rights-clock — the user's custody trackers
// POST /api/rights-clock — save a tracker (creates or links a Case)
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { trackerSchema } from "@/lib/rights-clock/schema";
import {
  caseSummaryFor,
  computeForTracker,
  isoToDate,
  serializeTracker,
  syncCaseFromTracker,
} from "@/lib/rights-clock/service";

const MAX_TRACKERS_PER_USER = 50;

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  try {
    const trackers = await prisma.custodyTracker.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return apiSuccess({ trackers: trackers.map((t) => serializeTracker(t)) });
  } catch (err) {
    logger.error("Rights Clock list failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("LIST_FAILED", "Could not load your trackers. Please try again.", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rl = await checkRateLimit(userId, "apiDefault");
  if (!rl.success) return apiError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);

  const body = await req.json().catch(() => null);
  const parsed = trackerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid details.", 422);
  }
  const data = parsed.data;

  try {
    const count = await prisma.custodyTracker.count({ where: { userId } });
    if (count >= MAX_TRACKERS_PER_USER) {
      return apiError("LIMIT_REACHED", "You have reached the maximum number of trackers. Delete one you no longer need.", 409);
    }

    // A caller-supplied case must belong to this user — never trust the id.
    if (data.caseId) {
      const owned = await prisma.case.findFirst({ where: { id: data.caseId, userId }, select: { id: true } });
      if (!owned) return apiError("NOT_FOUND", "Case not found.", 404);
    }

    const created = await prisma.$transaction(async (tx) => {
      const caseId =
        data.caseId ??
        (
          await tx.case.create({
            data: {
              userId,
              title: `Custody — ${data.personName}`.slice(0, 200),
              summary: caseSummaryFor({
                personName: data.personName,
                sections: data.sections,
                policeStation: data.policeStation,
                firNumber: data.firNumber,
              }),
              jurisdiction: data.policeStation?.slice(0, 100) ?? null,
            },
            select: { id: true },
          })
        ).id;

      const tracker = await tx.custodyTracker.create({
        data: {
          userId,
          caseId,
          personName: data.personName,
          relationship: data.relationship,
          policeStation: data.policeStation,
          firNumber: data.firNumber,
          courtName: data.courtName,
          prisonName: data.prisonName,
          arrestDate: isoToDate(data.arrestDate)!,
          firstRemandDate: isoToDate(data.firstRemandDate),
          sections: data.sections,
          otherLawCharges: data.otherLawCharges,
          chargesheetFiledOn: isoToDate(data.chargesheetFiledOn),
          priorConviction: data.priorConviction,
          otherPendingCases: data.otherPendingCases,
          inCustody: data.inCustody,
          remindersEnabled: data.remindersEnabled,
        },
      });

      await syncCaseFromTracker(tracker, computeForTracker(tracker), tx);
      return tracker;
    });

    logger.info("Rights Clock tracker created", { userId, trackerId: created.id });
    return apiSuccess({ tracker: serializeTracker(created) }, 201);
  } catch (err) {
    logger.error("Rights Clock create failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("CREATE_FAILED", "Could not save the tracker. Please try again.", 500);
  }
}
