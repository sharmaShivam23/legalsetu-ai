// ==========================================================
// LegalSetu — request legal-aid guidance
// ----------------------------------------------------------
// Turns the LawyerReferral model — present in the schema from
// the start but never actually written to — into a real
// workflow: a user can ask for help, optionally against an
// existing case, and see their own past requests afterwards.
//
// This does not connect to a live lawyer network (none is
// verified for this project), so it never pretends someone will
// call back. What it records is a genuine, private request the
// user can point to later, and a clear next step every time.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

const CATEGORIES = ["GENERAL", "WOMEN", "CHILD", "CYBERCRIME", "CONSUMER", "SENIOR_CITIZEN"] as const;

const schema = z.object({
  category: z.enum(CATEGORIES).default("GENERAL"),
  notes: z.string().max(1000).optional(),
  caseId: z.string().uuid().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const referrals = await prisma.lawyerReferral.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, category: true, notes: true, status: true, createdAt: true, caseId: true },
  });

  return apiSuccess({ referrals });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "apiDefault");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  // A caseId, if given, must actually belong to this user — otherwise
  // it is silently dropped rather than rejecting the whole request.
  let caseId: string | undefined = parsed.data.caseId;
  if (caseId) {
    const owned = await prisma.case.findFirst({ where: { id: caseId, userId }, select: { id: true } });
    if (!owned) caseId = undefined;
  }

  try {
    const referral = await prisma.lawyerReferral.create({
      data: {
        userId,
        caseId,
        category: parsed.data.category,
        notes: parsed.data.notes,
        reason: "USER_REQUESTED",
      },
    });
    logger.info("Legal aid referral requested", { userId, category: parsed.data.category });
    return apiSuccess({ referral }, 201);
  } catch (err) {
    logger.error("Legal aid referral failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("REFERRAL_FAILED", "Could not submit your request. Please try again.", 500);
  }
}
