// ==========================================================
// GET /api/lawyers/:id/photo — an advocate's profile photo
// Served to signed-in users when the advocate is listed; the advocate
// and admins can always see it (e.g. during review).
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/utils/api-response";
import { getStorageProvider } from "@/lib/storage/storage";
import { isListable } from "@/lib/lawyers/server";
import { requireUser } from "@/lib/lawyers/http";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireUser();
  if (g.error) return g.error;
  const { id } = await params;

  const p = await prisma.lawyerProfile.findUnique({ where: { id } }).catch(() => null);
  let allowed = Boolean(p && p.photoKey && (isListable(p) || p.userId === g.user.id || g.user.role === "ADMIN"));
  // A client keeps seeing their advocate's photo in an existing
  // conversation even if the advocate's listing lapses.
  if (p?.photoKey && !allowed) {
    allowed = (await prisma.consultationRequest.count({ where: { lawyerProfileId: id, citizenId: g.user.id } })) > 0;
  }
  if (!p || !allowed) return apiError("NOT_FOUND", "Photo not found.", 404);

  const data = await getStorageProvider().read(p.photoKey!);
  if (!data) return apiError("NOT_FOUND", "Photo not found.", 404);
  const type = p.photoKey!.endsWith(".png") ? "image/png" : p.photoKey!.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      // The URL carries a version (?v=updatedAt), so it can be cached privately.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
