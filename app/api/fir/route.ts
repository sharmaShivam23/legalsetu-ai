import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { firDraftSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "firGeneration");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many FIR draft requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = firDraftSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid FIR details.", 422);
  }

  try {
    const draft = await prisma.fIRDraft.create({
      data: {
        userId,
        status: "DRAFT",
        incidentType: parsed.data.incidentType,
        incidentDate: parsed.data.incidentDate
          ? new Date(parsed.data.incidentDate)
          : undefined,
        location: parsed.data.location,
        peopleInvolved: parsed.data.peopleInvolved,
        description: parsed.data.description,
        evidence: parsed.data.evidence,
        witnesses: parsed.data.witnesses,
        additionalDetails: parsed.data.additionalDetails,
      },
    });

    logger.info("FIR draft created", { userId, firDraftId: draft.id });
    return apiSuccess({ draft, label: "Draft / Assistance Document" });
  } catch (err) {
    logger.error("FIR draft creation failed", { userId, errorType: String(err) });
    return apiError("FIR_CREATE_FAILED", "Could not create FIR draft.", 500);
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const drafts = await prisma.fIRDraft
    .findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })
    .catch(() => []);

  return apiSuccess({ drafts });
}
