// ==========================================================
// GET /api/location — the signed-in user's saved search location
// PUT /api/location — set it from GPS, a PIN code, or a place name
//
// GPS coordinates are rounded to ~1 km BEFORE anything else happens
// to them — before reverse geocoding and before storage — so a precise
// home location never leaves this handler.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { locationSchema, isInIndia } from "@/lib/lawyers/validation";
import { roundForPrivacy } from "@/lib/lawyers/geo";
import { GeocodeError, geocodePincode, geocodeQuery, reverseGeocode } from "@/lib/lawyers/geocode";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

const view = (l: { latitude: number; longitude: number; label: string; pincode: string | null; source: string; updatedAt: Date }) => ({
  latitude: l.latitude,
  longitude: l.longitude,
  label: l.label,
  pincode: l.pincode,
  source: l.source,
  updatedAt: l.updatedAt,
});

export async function GET() {
  const g = await requireUser();
  if (g.error) return g.error;
  const loc = await prisma.userLocation.findUnique({ where: { userId: g.user.id } });
  return apiSuccess({ location: loc ? view(loc) : null });
}

export async function PUT(req: NextRequest) {
  const g = await requireUser("locationLookup");
  if (g.error) return g.error;

  const parsed = locationSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const input = parsed.data;

  let latitude: number;
  let longitude: number;
  let label: string;
  let pincode: string | null = null;
  try {
    if (input.source === "GPS") {
      latitude = roundForPrivacy(input.latitude);
      longitude = roundForPrivacy(input.longitude);
      if (!isInIndia(latitude, longitude)) {
        return apiError("OUTSIDE_INDIA", "Your location appears to be outside India. Enter a PIN code instead.", 422);
      }
      label = await reverseGeocode(latitude, longitude);
    } else {
      const point = input.source === "PINCODE" ? await geocodePincode(input.pincode) : await geocodeQuery(input.query);
      latitude = roundForPrivacy(point.latitude);
      longitude = roundForPrivacy(point.longitude);
      label = point.label;
      pincode = input.source === "PINCODE" ? input.pincode : point.pincode ?? null;
      if (!isInIndia(latitude, longitude)) return apiError("OUTSIDE_INDIA", "That place is outside India.", 422);
    }
  } catch (err) {
    if (err instanceof GeocodeError) {
      return apiError(err.kind, err.message, err.kind === "NOT_FOUND" ? 404 : 503);
    }
    throw err;
  }

  const saved = await prisma.userLocation.upsert({
    where: { userId: g.user.id },
    create: { userId: g.user.id, latitude, longitude, label: label.slice(0, 120), pincode, source: input.source },
    update: { latitude, longitude, label: label.slice(0, 120), pincode, source: input.source },
  });
  logger.info("User location saved", { userId: g.user.id, source: input.source });
  return apiSuccess({ location: view(saved) });
}
