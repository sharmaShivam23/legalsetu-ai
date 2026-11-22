// ==========================================================
// GET /api/lawyers — verified advocates
//
// ?lat&lng      search origin (default: the user's saved address)
// &radiusKm=5|10|25|50   optional — omitted means ALL distances
// &area &language &court &gender &legalAid=1 &available=1 &page
//
// Every listed advocate is returned by default, nearest first from the
// user's address. Without any location they are listed by name.
// No ratings, no paid placement (BCI Rule 36).
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { searchSchema } from "@/lib/lawyers/validation";
import { searchLawyers } from "@/lib/lawyers/server";
import { firstIssue, requireUser } from "@/lib/lawyers/http";

export async function GET(req: NextRequest) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const p = parsed.data;

  let lat = p.lat;
  let lng = p.lng;
  let label: string | null = null;
  if (lat === undefined || lng === undefined) {
    const saved = await prisma.userLocation.findUnique({ where: { userId: g.user.id } });
    lat = saved?.latitude;
    lng = saved?.longitude;
    label = saved?.label ?? null;
  }
  const hasOrigin = lat !== undefined && lng !== undefined;

  // A distance filter needs somewhere to measure from.
  if (p.radiusKm && !hasOrigin) {
    return apiError("LOCATION_REQUIRED", "Add your address to filter by distance.", 409);
  }

  const result = await searchLawyers({ ...p, lat, lng });
  return apiSuccess({
    ...result,
    origin: hasOrigin ? { latitude: lat, longitude: lng, label } : null,
    radiusKm: p.radiusKm ?? null,
  });
}
