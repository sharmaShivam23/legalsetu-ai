// ==========================================================
// POST /api/consultations/:id/shares  { caseId }
// The client shares one of their cases with the advocate (consent).
// Re-sharing a revoked case restores it.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { shareSchema } from "@/lib/lawyers/validation";
import { isOpen } from "@/lib/lawyers/consultation-rules";
import { audit } from "@/lib/lawyers/server";
import { loadForParty } from "@/lib/lawyers/consultations";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { id } = await params;
  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);
  if (found.party !== "CITIZEN") return apiError("FORBIDDEN", "Only the client can share their case.", 403);
  if (!isOpen(found.request.status)) return apiError("NOT_OPEN", "This consultation has ended.", 409);

  const parsed = shareSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const owned = await prisma.case.findFirst({ where: { id: parsed.data.caseId, userId: g.user.id }, select: { id: true, title: true } });
  if (!owned) return apiError("NOT_FOUND", "Case not found.", 404);

  const share = await prisma.caseShare.upsert({
    where: { requestId_caseId: { requestId: id, caseId: owned.id } },
    create: { requestId: id, caseId: owned.id },
    update: { revokedAt: null },
  });
  await audit(g.user.id, "CASE_SHARED", { requestId: id, caseId: owned.id });
  return apiSuccess({ share: { id: share.id, caseId: owned.id, caseTitle: owned.title, createdAt: share.createdAt, revokedAt: null, active: true } }, 201);
}
