// ==========================================================
// GET /api/lawyers/:id — one advocate's public profile
// Visible when listed (verified, not expired). The advocate always
// sees their own; admins see any.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { distanceKm } from "@/lib/lawyers/geo";
import { isListable, publicCard } from "@/lib/lawyers/server";
import { requireUser } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { id } = await params;

  const profile = await prisma.lawyerProfile.findUnique({ where: { id } }).catch(() => null);
  const visible = profile && (isListable(profile) || profile.userId === g.user.id || g.user.role === "ADMIN");
  if (!profile || !visible) return apiError("NOT_FOUND", "Advocate not found.", 404);

  const loc = await prisma.userLocation.findUnique({ where: { userId: g.user.id } });
  const d = loc ? distanceKm(loc.latitude, loc.longitude, profile.latitude, profile.longitude) : undefined;

  // The citizen's open request with this advocate, if any — so the UI
  // shows "Request sent" instead of a second request button.
  const open = await prisma.consultationRequest.findFirst({
    where: { citizenId: g.user.id, lawyerProfileId: id, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { id: true, status: true },
  });

  return apiSuccess({
    lawyer: publicCard(profile, d),
    isSelf: profile.userId === g.user.id,
    openConsultation: open,
  });
}
