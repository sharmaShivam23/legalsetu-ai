// ==========================================================
// GET    /api/rights-clock/:id — one tracker, recomputed for today
// PATCH  /api/rights-clock/:id — update facts (e.g. chargesheet filed)
// DELETE /api/rights-clock/:id — remove the tracker (the case stays)
// ==========================================================

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { trackerUpdateSchema } from "@/lib/rights-clock/schema";
import { computeForTracker, isoToDate, serializeTracker, syncCaseFromTracker } from "@/lib/rights-clock/service";

type Params = { params: Promise<{ id: string }> };

async function requireUser() {
  const session = await auth();
  if (!session?.user) return null;
  return (session.user as any).id as string;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;

  const tracker = await prisma.custodyTracker.findFirst({ where: { id, userId } }).catch(() => null);
  if (!tracker) return apiError("NOT_FOUND", "Tracker not found.", 404);
  return apiSuccess({ tracker: serializeTracker(tracker) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;

  const rl = await checkRateLimit(userId, "apiDefault");
  if (!rl.success) return apiError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);

  const body = await req.json().catch(() => null);
  const parsed = trackerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid details.", 422);
  }
  const d = parsed.data;
  // Only keys the client actually sent are written. Zod fills defaults
  // for absent booleans/enums, so presence is checked on the raw body.
  const sent = (k: string) => body && typeof body === "object" && k in body;

  const existing = await prisma.custodyTracker.findFirst({ where: { id, userId } }).catch(() => null);
  if (!existing) return apiError("NOT_FOUND", "Tracker not found.", 404);

  if (sent("caseId") && d.caseId) {
    const owned = await prisma.case.findFirst({ where: { id: d.caseId, userId }, select: { id: true } });
    if (!owned) return apiError("NOT_FOUND", "Case not found.", 404);
  }

  const data: Prisma.CustodyTrackerUpdateInput = {};
  if (sent("personName") && d.personName) data.personName = d.personName;
  for (const k of ["relationship", "policeStation", "firNumber", "courtName", "prisonName"] as const) {
    if (sent(k)) data[k] = d[k] ?? null;
  }
  if (sent("arrestDate") && d.arrestDate) data.arrestDate = isoToDate(d.arrestDate)!;
  if (sent("firstRemandDate")) data.firstRemandDate = isoToDate(d.firstRemandDate);
  if (sent("chargesheetFiledOn")) data.chargesheetFiledOn = isoToDate(d.chargesheetFiledOn);
  if (sent("sections") && d.sections) data.sections = d.sections;
  for (const k of ["otherLawCharges", "inCustody", "remindersEnabled"] as const) {
    if (sent(k) && typeof d[k] === "boolean") data[k] = d[k];
  }
  for (const k of ["priorConviction", "otherPendingCases"] as const) {
    if (sent(k) && d[k]) data[k] = d[k];
  }
  if (sent("caseId")) data.case = d.caseId ? { connect: { id: d.caseId } } : { disconnect: true };

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.custodyTracker.update({ where: { id }, data });
      await syncCaseFromTracker(t, computeForTracker(t), tx);
      return t;
    });
    logger.info("Rights Clock tracker updated", { userId, trackerId: id });
    return apiSuccess({ tracker: serializeTracker(updated) });
  } catch (err) {
    logger.error("Rights Clock update failed", { userId, trackerId: id, errorType: String(err).slice(0, 200) });
    return apiError("UPDATE_FAILED", "Could not save the changes. Please try again.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const { id } = await params;

  // deleteMany scoped by userId: a guessed id belonging to someone else
  // deletes nothing and is reported exactly like a missing one.
  const { count } = await prisma.custodyTracker.deleteMany({ where: { id, userId } }).catch(() => ({ count: 0 }));
  if (count === 0) return apiError("NOT_FOUND", "Tracker not found.", 404);
  logger.info("Rights Clock tracker deleted", { userId, trackerId: id });
  return apiSuccess({ deleted: true });
}
