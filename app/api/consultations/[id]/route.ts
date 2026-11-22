// ==========================================================
// GET   /api/consultations/:id — one consultation (parties only)
// PATCH /api/consultations/:id — { action: accept|decline|cancel|close }
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { consultationActionSchema } from "@/lib/lawyers/validation";
import { nextStatus } from "@/lib/lawyers/consultation-rules";
import { audit, notifyLater } from "@/lib/lawyers/server";
import { consultationInclude, loadForParty, messageStats, serializeConsultation } from "@/lib/lawyers/consultations";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireUser();
  if (g.error) return g.error;
  const { id } = await params;
  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);
  const s = (await messageStats([id], g.user.id)).get(id)!;
  return apiSuccess({ consultation: serializeConsultation(found.request, found.party, s.unread, s.last) });
}

const PAST: Record<string, string> = { accept: "accepted", decline: "declined", cancel: "cancelled", close: "closed" };

export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { id } = await params;

  const parsed = consultationActionSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const { action, reason } = parsed.data;

  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);
  const { request, party } = found;

  const t = nextStatus(request.status, action, party);
  if (!t.ok) return apiError("INVALID_TRANSITION", t.reason, 409);

  const now = new Date();
  // Conditional update: if the other party acted a moment ago, the row
  // no longer has the status we checked, and nothing is overwritten.
  const { count } = await prisma.consultationRequest.updateMany({
    where: { id, status: request.status },
    data: {
      status: t.status,
      ...(action === "accept" || action === "decline" ? { respondedAt: now } : {}),
      ...(action === "decline" ? { declineReason: reason } : {}),
      ...(action === "close" || action === "cancel" ? { closedAt: now } : {}),
    },
  });
  if (count === 0) return apiError("CONFLICT", "This request changed just now. Refresh and try again.", 409);

  const updated = await prisma.consultationRequest.findUniqueOrThrow({ where: { id }, include: consultationInclude });
  await audit(g.user.id, `CONSULTATION_${t.status}`, { requestId: id });
  logger.info("Consultation status changed", { requestId: id, newStatus: t.status });

  // Tell the other side.
  const other =
    party === "LAWYER"
      ? await prisma.user.findUnique({ where: { id: request.citizenId }, select: { email: true, name: true } })
      : await prisma.user.findUnique({ where: { id: request.lawyer.userId }, select: { email: true, name: true } });
  notifyLater(other?.email, {
    name: other?.name,
    subject: `Your consultation request was ${PAST[action]}`,
    heading: `Consultation ${PAST[action]}`,
    body:
      action === "accept"
        ? `${request.lawyer.fullName} accepted your request. You can now message each other on LegalSetu.`
        : action === "decline"
          ? `${request.lawyer.fullName} could not take your request${reason ? `: "${reason}"` : "."} You can ask another advocate, or contact free legal aid on 15100.`
          : `The consultation was ${PAST[action]} by the ${party === "LAWYER" ? "advocate" : "client"}. Shared case files are no longer visible to the advocate.`,
    ctaLabel: "Open the consultation",
    ctaPath: `/dashboard/consultations/${id}`,
  });

  const s = (await messageStats([id], g.user.id)).get(id)!;
  return apiSuccess({ consultation: serializeConsultation(updated, party, s.unread, s.last) });
}
