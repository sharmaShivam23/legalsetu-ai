// ==========================================================
// DELETE /api/consultations/:id/shares/:shareId — revoke consent.
// The advocate loses access immediately.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { audit } from "@/lib/lawyers/server";
import { loadForParty } from "@/lib/lawyers/consultations";
import { requireUser } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string; shareId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { id, shareId } = await params;
  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);
  if (found.party !== "CITIZEN") return apiError("FORBIDDEN", "Only the client can stop sharing.", 403);

  const { count } = await prisma.caseShare.updateMany({
    where: { id: shareId, requestId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return apiError("NOT_FOUND", "Share not found.", 404);
  await audit(g.user.id, "CASE_SHARE_REVOKED", { requestId: id, shareId });
  return apiSuccess({ revoked: true });
}
