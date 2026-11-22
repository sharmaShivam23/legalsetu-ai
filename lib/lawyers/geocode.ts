// ==========================================================
// LegalSetu — geocoding via OpenStreetMap Nominatim (server-only)
// ----------------------------------------------------------
// Used for: PIN code → location, "change location" search, and
// a human-readable area name for GPS coordinates.
//
// The public Nominatim service has a strict usage policy: at most
// one request per second, an identifying User-Agent, results cached,
// and no search-as-you-type. All of that is enforced here. For real
// traffic, set GEOCODER_URL to a self-hosted Nominatim or a provider
// that speaks the same API.
// ==========================================================

export interface GeoPoint {
  latitude: number;
  longitude: number;
  /** Short area name, e.g. "Saket, New Delhi". */
  label: string;
  pincode?: string;
}

export class GeocodeError extends Error {
  constructor(
    public readonly kind: "NOT_FOUND" | "UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "GeocodeError";
  }
}

const BASE = () => (process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const USER_AGENT = () => process.env.GEOCODER_USER_AGENT || "LegalSetu/0.1 (legal-aid lawyer directory)";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 1000;

const cache = new Map<string, { value: GeoPoint | null; expires: number }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** Test hook. */
export function resetGeocoderState() {
  cache.clear();
  queue = Promise.resolve();
  lastCall = 0;
}

/** Serialises calls so they are at least MIN_INTERVAL_MS apart. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  address?: Record<string, string>;
  display_name?: string;
}

export function labelFor(place: NominatimPlace): string {
  const a = place.address ?? {};
  const local = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || a.town;
  const city = a.city || a.town || a.state_district || a.county || a.state;
  const parts = [local, city].filter((p, i, arr): p is string => Boolean(p) && arr.indexOf(p) === i);
  if (parts.length) return parts.join(", ");
  return (place.display_name ?? "Selected location").split(",").slice(0, 2).join(",").trim();
}

async function call(path: string, params: Record<string, string>): Promise<NominatimPlace[] | NominatimPlace | null> {
  const key = `${path}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as never;

  const url = `${BASE()}${path}?${new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1" })}`;
  const result = await throttled(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT(), "Accept-Language": "en" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new GeocodeError("UNAVAILABLE", "The location service is not reachable right now. Try a PIN code again in a moment.");
    }
    if (res.status === 429 || res.status >= 500) {
      throw new GeocodeError("UNAVAILABLE", "The location service is busy. Please try again in a moment.");
    }
    if (!res.ok) throw new GeocodeError("NOT_FOUND", "That place could not be found.");
    return (await res.json()) as NominatimPlace[] | NominatimPlace;
  });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { value: result as never, expires: Date.now() + CACHE_TTL_MS });
  return result;
}

function toPoint(place: NominatimPlace | undefined, pincode?: string): GeoPoint {
  if (!place) throw new GeocodeError("NOT_FOUND", "That place could not be found in India.");
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new GeocodeError("NOT_FOUND", "That place could not be found.");
  return { latitude, longitude, label: labelFor(place), pincode: pincode ?? place.address?.postcode };
}

export async function geocodePincode(pincode: string): Promise<GeoPoint> {
  const r = (await call("/search", { postalcode: pincode, countrycodes: "in", limit: "1" })) as NominatimPlace[];
  if (!Array.isArray(r) || r.length === 0) throw new GeocodeError("NOT_FOUND", `PIN code ${pincode} could not be found.`);
  return toPoint(r[0], pincode);
}

export async function geocodeQuery(query: string): Promise<GeoPoint> {
  const r = (await call("/search", { q: query, countrycodes: "in", limit: "1" })) as NominatimPlace[];
  if (!Array.isArray(r) || r.length === 0) throw new GeocodeError("NOT_FOUND", `"${query}" could not be found in India.`);
  return toPoint(r[0]);
}

/** Area name for coordinates. Falls back to a neutral label rather than failing. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const r = (await call("/reverse", { lat: latitude.toFixed(4), lon: longitude.toFixed(4), zoom: "14" })) as NominatimPlace;
    return r && "lat" in r ? labelFor(r) : "Current location";
  } catch {
    return "Current location";
  }
}
