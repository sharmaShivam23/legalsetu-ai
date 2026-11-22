// ==========================================================
// LegalSetu — the address a user gives at sign-up → a saved location
// (server-only)
//
// Order of preference:
//   1. GPS from "Use my current location" (rounded to ~1 km first)
//   2. the PIN code
//   3. the typed address
// A geocoder outage must never block an account from being created —
// in that case no location is saved and Find a Lawyer asks for it later.
// ==========================================================

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { roundForPrivacy } from "./geo";
import { GeocodeError, geocodePincode, geocodeQuery, reverseGeocode } from "./geocode";
import { isInIndia, type SignupAddress } from "./validation";

export type { SignupAddress };


/** "12 MG Road, Saket, New Delhi" → "Saket, New Delhi" (last two parts). */
export function shortLabel(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return (parts.length > 2 ? parts.slice(-2) : parts).join(", ").slice(0, 120) || "My address";
}

export async function resolveSignupLocation(
  a: SignupAddress
): Promise<{ latitude: number; longitude: number; label: string; source: string } | null> {
  if (a.latitude != null && a.longitude != null) {
    const latitude = roundForPrivacy(a.latitude);
    const longitude = roundForPrivacy(a.longitude);
    if (isInIndia(latitude, longitude)) {
      const label = await reverseGeocode(latitude, longitude);
      return { latitude, longitude, label: label === "Current location" ? shortLabel(a.address) : label, source: "GPS" };
    }
  }
  for (const lookup of [() => geocodePincode(a.pincode), () => geocodeQuery(a.address)]) {
    try {
      const p = await lookup();
      const latitude = roundForPrivacy(p.latitude);
      const longitude = roundForPrivacy(p.longitude);
      if (isInIndia(latitude, longitude)) return { latitude, longitude, label: p.label, source: "SIGNUP" };
    } catch (err) {
      if (!(err instanceof GeocodeError)) throw err;
    }
  }
  return null;
}

/** Saves the sign-up address as the user's search location. Never throws. */
export async function saveSignupLocation(userId: string, a: SignupAddress): Promise<boolean> {
  try {
    const loc = await resolveSignupLocation(a);
    if (!loc) {
      logger.warn("Sign-up address could not be located", { userId });
      return false;
    }
    await prisma.userLocation.upsert({
      where: { userId },
      create: { userId, ...loc, pincode: a.pincode, address: a.address },
      update: { ...loc, pincode: a.pincode, address: a.address },
    });
    return true;
  } catch (err) {
    logger.warn("Saving sign-up location failed", { userId, errorType: String(err).slice(0, 200) });
    return false;
  }
}
