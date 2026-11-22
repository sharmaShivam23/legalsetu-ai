// ==========================================================
// LegalSetu — Verified Lawyer Connect: geography (pure)
// ==========================================================

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A lat/lng box that fully contains the circle of `radiusKm` — used as
 * an indexed pre-filter before the exact distance check.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 110.574;
  // Longitude degrees shrink towards the poles; clamp to avoid /0.
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * Rounds a citizen's coordinates to 2 decimal places (~1.1 km) before
 * they are stored. Enough to find nearby lawyers; not enough to find
 * the citizen's house.
 */
export function roundForPrivacy(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "2.34 km" → "2.3 km"; under 1 km in metres. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
