// ==========================================================
// LegalSetu — FIR Assistant: edit facts, settle contradictions
// ----------------------------------------------------------
// The review screen must be genuinely editable: a complaint the
// user cannot correct is one they will sign with an error in it.
//
// Every edit here is recorded with source "USER", because a value
// the complainant typed on the review screen is their statement,
// and it takes precedence over anything a document or the model
// suggested. Editing also bumps the draft version so a previously
// generated PDF can never be mistaken for the current one.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import {
  FACT_KEYS,
  upsertFact,
  type FactKey,
  type FIRCaseState,
} from "@/lib/fir/case-state";
import { refreshContradictions, resolveContradiction } from "@/lib/fir/contradictions";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Facts the user corrected on the review screen. */
  edits: z
    .array(
      z.object({
        key: z.string(),
        value: z.string().max(2000),
      })
    )
    .optional(),
  /** Contradictions the user has settled. */
  resolutions: z
    .array(z.object({ id: z.string(), value: z.string().max(2000) }))
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const rateLimit = await checkRateLimit(userId, "apiDefault");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid changes.", 422);
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

    const now = new Date().toISOString();

    for (const edit of parsed.data.edits ?? []) {
      if (!(FACT_KEYS as readonly string[]).includes(edit.key)) continue;
      const value = edit.value.trim();
      if (!value) continue;

      state = upsertFact(state, {
        key: edit.key as FactKey,
        value,
        source: "USER",
        confidence: "CONFIRMED",
        evidence: "Entered by the complainant on the review screen",
        recordedAt: now,
      });
    }

    for (const resolution of parsed.data.resolutions ?? []) {
      state = resolveContradiction(state, resolution.id, resolution.value.trim());
    }

    // Re-scan after edits: a correction can settle a conflict, and can
    // equally introduce a new one.
    state = refreshContradictions(state);

    const nextVersion = draft.draftVersion + 1;
    state = { ...state, draftVersion: nextVersion };

    await prisma.fIRDraft.update({
      where: { id },
      data: { caseState: state as unknown as object, draftVersion: nextVersion },
    });

    return apiSuccess({ state, draftVersion: nextVersion });
  } catch (err) {
    logger.error("FIR fact update failed", {
      userId,
      errorType: String(err).slice(0, 200),
    });
    return apiError("UPDATE_FAILED", "Could not save those changes. Please try again.", 500);
  }
}
