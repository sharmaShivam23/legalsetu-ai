// ==========================================================
// LegalSetu — FIR Assistant: one turn of the intake
// ----------------------------------------------------------
// Takes what the complainant just said, extracts every fact in
// it, re-evaluates what is still missing, and returns the single
// next question — or declares the intake ready for review.
//
// Ownership is enforced on the draft itself: a complaint contains
// some of the most sensitive material a person will ever type, so
// a guessed id must return 404, never someone else's case.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { runInvestigationTurn } from "@/lib/fir/investigator";
import { retrieveLegalContext } from "@/lib/fir/legal-context";
import {
  emptyCaseState,
  type FIRCaseState,
  type FactKey,
  FACT_KEYS,
} from "@/lib/fir/case-state";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  /** Set when the user declines a question rather than answering it. */
  skipKey: z.string().optional(),
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
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid message.", 422);
  }

  try {
    const draft = await prisma.fIRDraft.findFirst({
      where: { id, userId },
      select: { id: true, caseState: true, language: true },
    });
    if (!draft) return apiError("NOT_FOUND", "Complaint draft not found.", 404);

    let state: FIRCaseState =
      (draft.caseState as unknown as FIRCaseState) ??
      emptyCaseState(parsed.data.language ?? draft.language ?? "en");

    // Honour a declined question before running the turn, so the next
    // question never circles back to something the user passed on.
    if (parsed.data.skipKey && (FACT_KEYS as readonly string[]).includes(parsed.data.skipKey)) {
      const key = parsed.data.skipKey as FactKey;
      state = {
        ...state,
        skippedKeys: state.skippedKeys.includes(key)
          ? state.skippedKeys
          : [...state.skippedKeys, key],
      };
    }

    const turn = await runInvestigationTurn(state, parsed.data.message);
    let nextState = turn.state;

    // Statutory context is retrieved once, at the point the account is
    // complete — not on every turn, which would be a vector search per
    // keystroke for no benefit.
    if (turn.complete && nextState.legalContext.length === 0) {
      nextState = { ...nextState, legalContext: await retrieveLegalContext(nextState) };
    }

    await prisma.fIRDraft.update({
      where: { id },
      data: {
        caseState: nextState as unknown as object,
        incidentType:
          nextState.facts.find((f) => f.key === "incidentType")?.value ?? undefined,
        location:
          nextState.facts.find((f) => f.key === "incidentLocation")?.value ?? undefined,
      },
    });

    return apiSuccess({
      state: nextState,
      nextQuestion: turn.nextQuestion,
      complete: turn.complete,
      safetyAlert: turn.safetyAlert,
    });
  } catch (err) {
    logger.error("FIR investigation turn failed", {
      userId,
      errorType: String(err).slice(0, 200),
    });
    return apiError(
      "INVESTIGATION_FAILED",
      "Could not process that just now. Please try again.",
      500
    );
  }
}
