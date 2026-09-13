// ==========================================================
// LegalSetu — FIR Assistant: PDF rendering
// ----------------------------------------------------------
// Renders server-side so the Unicode fonts live on disk rather
// than being shipped to every browser, and so the draft is
// re-validated against the case state immediately before any
// printable bytes exist.
//
// The PDF is always built from the CURRENT confirmed state, so
// editing a fact and downloading again cannot silently produce
// the previous version.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { generateComplaintDraft } from "@/lib/fir/draft-generator";
import { renderComplaintPdf } from "@/lib/fir/pdf";
import { blockingContradictions, type FIRCaseState } from "@/lib/fir/case-state";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
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

  try {
    const draft = await prisma.fIRDraft.findFirst({
      where: { id, userId },
      select: { id: true, caseState: true, draftVersion: true },
    });
    if (!draft) return apiError("NOT_FOUND", "Complaint draft not found.", 404);

    const state = draft.caseState as unknown as FIRCaseState | null;
    if (!state) {
      return apiError("NO_CASE_DATA", "There is nothing recorded for this complaint yet.", 422);
    }

    if (blockingContradictions(state).length > 0) {
      return apiError(
        "UNRESOLVED_CONTRADICTIONS",
        "Some details still need confirming before a PDF can be produced.",
        409
      );
    }

    const generated = await generateComplaintDraft(state, session.user.name ?? undefined);
    const pdf = renderComplaintPdf(generated.document);

    logger.info("FIR complaint PDF rendered", {
      userId,
      draftVersion: draft.draftVersion,
      validated: generated.validated,
      bytes: pdf.length,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="legalsetu-complaint-draft-v${draft.draftVersion || 1}.pdf"`,
        // A complaint contains sensitive personal detail — never cached
        // by an intermediary.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("FIR PDF rendering failed", {
      userId,
      errorType: String(err).slice(0, 200),
    });
    return apiError("PDF_FAILED", "Could not produce the PDF right now. Please try again.", 500);
  }
}
