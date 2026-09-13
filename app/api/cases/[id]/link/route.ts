// ==========================================================
// LegalSetu — attach or detach a conversation / document / FIR
// draft to a case
// ----------------------------------------------------------
// This is the mechanism that turns "My Cases" from a folder you
// create once into the connective layer across the whole app:
// a Case Analysis chat from three weeks ago, the notice you had
// OCR'd last week, and the FIR draft you started today all live
// under one roof once linked.
//
// Every lookup is scoped to BOTH the case and the record's own
// userId, so this can never be used to pull someone else's chat
// into your case, or vice versa.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  kind: z.enum(["conversation", "document", "firDraft"]),
  recordId: z.string().uuid(),
  /** false links it to this case; true clears the link entirely. */
  unlink: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id: caseId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const theCase = await prisma.case.findFirst({ where: { id: caseId, userId }, select: { id: true } });
  if (!theCase) return apiError("NOT_FOUND", "Case not found.", 404);

  const { kind, recordId, unlink } = parsed.data;
  const nextCaseId = unlink ? null : caseId;

  try {
    let result;
    if (kind === "conversation") {
      result = await prisma.conversation.updateMany({
        where: { id: recordId, userId },
        data: { caseId: nextCaseId },
      });
    } else if (kind === "document") {
      result = await prisma.document.updateMany({
        where: { id: recordId, userId },
        data: { caseId: nextCaseId },
      });
    } else {
      result = await prisma.fIRDraft.updateMany({
        where: { id: recordId, userId },
        data: { caseId: nextCaseId },
      });
    }

    if (result.count === 0) {
      return apiError("NOT_FOUND", "That item could not be found in your account.", 404);
    }

    return apiSuccess({ linked: !unlink });
  } catch (err) {
    logger.error("Case link update failed", { userId, caseId, errorType: String(err).slice(0, 200) });
    return apiError("LINK_FAILED", "Could not update that link.", 500);
  }
}
