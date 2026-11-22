"use client";

import { readApi } from "./api";

import { useState } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SavedLocation {
  latitude: number;
  longitude: number;
  label: string;
  pincode: string | null;
  source: string;
}

type Mode = "pincode" | "search";

/**
 * Sets the user's search location from GPS, a PIN code or a place name.
 * Everything goes through PUT /api/location, which rounds coordinates
 * to ~1 km before storing them.
 */
export function LocationPicker({
  onSaved,
  className,
  tone = "app",
}: {
  onSaved: (loc: SavedLocation) => void;
  className?: string;
  /** "auth" matches the sign-up page styling. */
  tone?: "app" | "auth";
}) {
  const [mode, setMode] = useState<Mode>("pincode");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"gps" | "text" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>, kind: "gps" | "text") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readApi(res);
      if (!json.success) {
        setError(json.error?.message ?? "Could not set the location.");
        return;
      }
      onSaved(json.data.location);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  function useGps() {
    if (!("geolocation" in navigator)) {
      setError("Your browser cannot share location. Enter a PIN code instead.");
      return;
    }
    setBusy("gps");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => void save({ source: "GPS", latitude: pos.coords.latitude, longitude: pos.coords.longitude }, "gps"),
      (err) => {
        setBusy(null);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Enter your PIN code instead."
            : "Could not get your location. Enter your PIN code instead."
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 }
    );
  }

  function submitText(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (mode === "pincode") {
      if (!/^[1-9]\d{5}$/.test(v)) return setError("Enter a valid 6-digit PIN code.");
      void save({ source: "PINCODE", pincode: v }, "text");
    } else {
      if (v.length < 2) return setError("Enter a city or area.");
      void save({ source: "SEARCH", query: v }, "text");
    }
  }

  const auth = tone === "auth";
  const inputCls = auth
    ? "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    : "w-full rounded-xl border border-borderCustom bg-card px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue";

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={useGps}
        disabled={busy !== null}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60",
          auth ? "h-12 bg-indigo-600" : "h-11 bg-brandBlue text-sm"
        )}
      >
        {busy === "gps" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
        Use my current location
      </button>

      <div className={cn("flex items-center gap-2 text-xs", auth ? "text-slate-400" : "text-textSecondary")}>
        <span className="h-px flex-1 bg-current opacity-30" />
        or
        <span className="h-px flex-1 bg-current opacity-30" />
      </div>

      <div role="tablist" className="flex gap-1.5">
        {(
          [
            ["pincode", "PIN code"],
            ["search", "City or area"],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setValue("");
              setError(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              mode === m
                ? auth
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-brandBlue bg-brandBlue text-white"
                : auth
                  ? "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  : "border-borderCustom text-textSecondary"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <form onSubmit={submitText} className="flex gap-2">
        <label className="sr-only" htmlFor="location-input">
          {mode === "pincode" ? "PIN code" : "City or area"}
        </label>
        <input
          id="location-input"
          className={inputCls}
          value={value}
          onChange={(e) => setValue(mode === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
          inputMode={mode === "pincode" ? "numeric" : "text"}
          placeholder={mode === "pincode" ? "e.g. 110017" : "e.g. Saket, New Delhi"}
          autoComplete={mode === "pincode" ? "postal-code" : "address-level2"}
        />
        <button
          type="submit"
          disabled={busy !== null}
          aria-label="Set location"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border px-4 disabled:opacity-60",
            auth ? "h-12 border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200" : "border-borderCustom text-textPrimary hover:bg-canvas"
          )}
        >
          {busy === "text" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : mode === "pincode" ? <MapPin className="h-4 w-4" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <p className={cn("text-[11px] leading-relaxed", auth ? "text-slate-400" : "text-textSecondary")}>
        Saved only to about 1 km and never shown to lawyers. Used to find advocates near you.
      </p>
    </div>
  );
}
