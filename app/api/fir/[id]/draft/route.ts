// ==========================================================
// LegalSetu — FIR Assistant: generate the complaint draft
// ----------------------------------------------------------
// Only runs once the complainant has confirmed the facts. Two
// gates stand in front of generation:
//
//   1. Unresolved blocking contradictions stop it outright. A
//      complaint that says two different dates is worse than no
//      complaint, and only the user can say which is right.
//   2. The generated text is validated against the case state,
//      so a fabricated date, amount or statute cannot reach a
//      document the complainant will sign.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { generateComplaintDraft } from "@/lib/fir/draft-generator";
import { retrieveLegalContext } from "@/lib/fir/legal-context";
import { blockingContradictions, type FIRCaseState } from "@/lib/fir/case-state";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  /** The user has seen the review screen and confirmed it. */
  confirmed: z.boolean(),
  language: z.string().min(2).max(10).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const rateLimit = await checkRateLimit(userId, "aiGeneration");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !parsed.data.confirmed) {
    return apiError(
      "NOT_CONFIRMED",
      "Please review and confirm the details before the draft is prepared.",
      422
    );
  }

  try {
    const draft = await prisma.fIRDraft.findFirst({
      where: { id, userId },
      select: { id: true, caseState: true, draftVersion: true },
    });
    if (!draft) return apiError("NOT_FOUND", "Complaint draft not found.", 404);

    let state = draft.caseState as unknown as FIRCaseState | null;
    if (!state) {
      return apiError("NO_CASE_DATA", "There is nothing recorded for this complaint yet.", 422);
    }

    const blocking = blockingContradictions(state);
    if (blocking.length > 0) {
      return apiError(
        "UNRESOLVED_CONTRADICTIONS",
        "Some details still need confirming before the draft can be prepared.",
        409
      );
    }

    if (parsed.data.language) state = { ...state, language: parsed.data.language };
    if (state.legalContext.length === 0) {
      state = { ...state, legalContext: await retrieveLegalContext(state) };
    }

    const generated = await generateComplaintDraft(
      state,
      session.user.name ?? undefined
    );

    const nextVersion = draft.draftVersion + 1;
    const confirmedState: FIRCaseState = {
      ...state,
      stage: "DRAFTED",
      confirmedAt: new Date().toISOString(),
      draftVersion: nextVersion,
    };

    await prisma.fIRDraft.update({
      where: { id },
      data: {
        caseState: confirmedState as unknown as object,
        draftText: generated.plainText,
        draftVersion: nextVersion,
        description: generated.plainText.slice(0, 4000),
      },
    });

    return apiSuccess({
      document: generated.document,
      plainText: generated.plainText,
      // Surfaced rather than hidden: if the model slipped something in
      // that the facts do not support, the user should see exactly what.
      issues: generated.issues,
      validated: generated.validated,
      draftVersion: nextVersion,
    });
  } catch (err) {
    logger.error("FIR draft generation failed", {
      userId,
      errorType: String(err).slice(0, 200),
    });
    return apiError("DRAFT_FAILED", "Could not prepare the draft right now. Please try again.", 500);
  }
}
