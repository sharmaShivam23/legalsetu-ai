// ==========================================================
// GET /api/rights-clock/:id/application?kind=default-bail|section-479|jail-letter
// Renders a print-ready application draft as PDF, always from the
// tracker's CURRENT facts and today's computation.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { renderComplaintPdf } from "@/lib/fir/pdf";
import {
  ApplicationUnavailableError,
  buildApplication,
  type ApplicationKind,
} from "@/lib/rights-clock/applications";
import { computeForTracker, trackerToInput } from "@/lib/rights-clock/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: ApplicationKind[] = ["default-bail", "section-479", "jail-letter"];

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const kind = req.nextUrl.searchParams.get("kind") as ApplicationKind | null;
  if (!kind || !KINDS.includes(kind)) return apiError("VALIDATION_ERROR", "Unknown application type.", 422);

  const rl = await checkRateLimit(userId, "apiDefault");
  if (!rl.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  const tracker = await prisma.custodyTracker.findFirst({ where: { id, userId } }).catch(() => null);
  if (!tracker) return apiError("NOT_FOUND", "Tracker not found.", 404);

  try {
    const doc = buildApplication(kind, tracker, trackerToInput(tracker), computeForTracker(tracker));
    const pdf = renderComplaintPdf(doc);
    logger.info("Rights Clock application rendered", { userId, trackerId: id, kind, bytes: pdf.length });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="legalsetu-${kind}-draft.pdf"`,
        // Names a person in custody and their charges — never cached.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApplicationUnavailableError) return apiError("NOT_APPLICABLE", err.message, 409);
    logger.error("Rights Clock application failed", { userId, trackerId: id, kind, errorType: String(err).slice(0, 200) });
    return apiError("PDF_FAILED", "Could not produce the PDF right now. Please try again.", 500);
  }
}
