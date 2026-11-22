"use client";

import { useState } from "react";
import { Loader2, LocateFixed, MapPin, X } from "lucide-react";

export interface SignupAddressValue {
  address: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

export const EMPTY_SIGNUP_ADDRESS: SignupAddressValue = { address: "", pincode: "", latitude: null, longitude: null };

const GEOCODER = (process.env.NEXT_PUBLIC_GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");

interface ReversePlace {
  display_name?: string;
  address?: Record<string, string>;
}

/** A readable street-level address from a reverse-geocode result (no country/state noise). */
function addressFrom(place: ReversePlace): string {
  const a = place.address ?? {};
  const parts = [
    [a.house_number, a.road].filter(Boolean).join(" "),
    a.neighbourhood || a.suburb || a.quarter,
    a.city_district,
    a.city || a.town || a.village || a.state_district,
  ].filter((p, i, arr): p is string => Boolean(p) && arr.indexOf(p) === i);
  return parts.length ? parts.join(", ") : (place.display_name ?? "").split(",").slice(0, 4).join(",").trim();
}

/**
 * Address on the sign-up form: typed, or filled from "Use my current
 * location". The coordinates are sent with the account and rounded to
 * ~1 km on the server before they are stored.
 */
export function SignupAddressFields({
  value,
  onChange,
}: {
  value: SignupAddressValue;
  onChange: (v: SignupAddressValue) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setNote({ kind: "error", text: "Your browser cannot share location. Please type your address." });
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let next: SignupAddressValue = { ...value, latitude, longitude };
        try {
          // Browser-side lookup so the address can be filled in before the
          // account exists. Same public service the server uses.
          const res = await fetch(
            `${GEOCODER}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`,
            { headers: { "Accept-Language": "en" } }
          );
          if (res.ok) {
            const place = (await res.json()) as ReversePlace;
            const postcode = (place.address?.postcode ?? "").replace(/\s/g, "");
            next = {
              ...next,
              address: value.address.trim() ? value.address : addressFrom(place),
              pincode: /^[1-9]\d{5}$/.test(postcode) ? postcode : value.pincode,
            };
          }
          setNote({ kind: "ok", text: "Current location added. Check the address below and correct it if needed." });
        } catch {
          setNote({ kind: "ok", text: "Current location added. Please type your address and PIN code too." });
        } finally {
          onChange(next);
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setNote({
          kind: "error",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied. Please type your address and PIN code."
              : "Could not get your location. Please type your address and PIN code.",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5 * 60_000 }
    );
  }

  const fieldBox =
    "input-float relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs";
  const inputCls =
    "h-14 w-full rounded-xl border-none bg-transparent pl-12 pr-4 text-slate-900 outline-none dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600";

  return (
    <fieldset className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Your address</legend>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LocateFixed className="h-3.5 w-3.5" aria-hidden />}
          Use my current location
        </button>
      </div>

      <div className={fieldBox}>
        <MapPin className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden />
        <input
          aria-label="Address (house, street, area, city)"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="House, street, area, city"
          autoComplete="street-address"
          maxLength={300}
          className={inputCls}
        />
      </div>
      <div className={fieldBox}>
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-500" aria-hidden>
          PIN
        </span>
        <input
          aria-label="PIN code"
          value={value.pincode}
          onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
          placeholder="6-digit PIN code"
          inputMode="numeric"
          autoComplete="postal-code"
          className={inputCls}
        />
      </div>

      {value.latitude !== null && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          Current location attached
          <button
            type="button"
            aria-label="Remove current location"
            onClick={() => {
              onChange({ ...value, latitude: null, longitude: null });
              setNote(null);
            }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {note && (
        <p role={note.kind === "error" ? "alert" : "status"} className={note.kind === "error" ? "text-xs text-rose-600 dark:text-rose-400" : "text-xs text-slate-500 dark:text-slate-400"}>
          {note.text}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-slate-400">
        Used to show lawyers and legal aid near you. Kept private — never shown to lawyers.
      </p>
    </fieldset>
  );
}
