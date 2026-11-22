// ==========================================================
// GET /api/geocode?pincode=110017  |  ?q=Saket, New Delhi
// Looks a place up without saving anything — used by advocates to
// place their office on the map.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { GeocodeError, geocodePincode, geocodeQuery } from "@/lib/lawyers/geocode";
import { requireUser } from "@/lib/lawyers/http";

const schema = z.union([
  z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code.") }),
  z.object({ q: z.string().trim().min(2, "Enter a place.").max(120) }),
]);

export async function GET(req: NextRequest) {
  const g = await requireUser("locationLookup");
  if (g.error) return g.error;
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(raw.pincode ? { pincode: raw.pincode } : { q: raw.q ?? "" });
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid place.", 422);
  try {
    const point = "pincode" in parsed.data ? await geocodePincode(parsed.data.pincode) : await geocodeQuery(parsed.data.q);
    return apiSuccess({ point });
  } catch (err) {
    if (err instanceof GeocodeError) return apiError(err.kind, err.message, err.kind === "NOT_FOUND" ? 404 : 503);
    throw err;
  }
}
