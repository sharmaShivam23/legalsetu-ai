"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Info, List, Loader2, Map as MapIcon, MapPin, Phone, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { COURTS, GENDERS, LAWYER_LANGUAGES, PRACTICE_AREAS, RADIUS_OPTIONS_KM, label } from "@/lib/lawyers/constants";
import { formatDistance } from "@/lib/lawyers/geo";
import type { PublicLawyerCard } from "@/lib/lawyers/server";
import { LocationPicker, type SavedLocation } from "./location-picker";
import { LawyerMap, type MapPin as Pin } from "./map";
import { Avatar, Chip, DemoBadge, LegalAidBadge, VerifiedBadge } from "./ui";

interface Filters {
  /** null = all distances (the default). */
  radiusKm: number | null;
  area: string;
  language: string;
  court: string;
  gender: string;
  legalAid: boolean;
  available: boolean;
}

const EMPTY: Filters = { radiusKm: null, area: "", language: "", court: "", gender: "", legalAid: false, available: true };

const selectCls =
  "w-full rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue";

function LawyerCard({ l, index, highlighted, onHover }: { l: PublicLawyerCard; index: number; highlighted: boolean; onHover: (id: string | null) => void }) {
  return (
    <Link
      href={`/dashboard/lawyers/${l.id}`}
      onMouseEnter={() => onHover(l.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(l.id)}
      onBlur={() => onHover(null)}
      className={cn(
        "group flex gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-brandBlue/50",
        highlighted ? "border-brandBlue/60" : "border-borderCustom"
      )}
    >
      <div className="relative">
        <Avatar name={l.fullName} photoUrl={l.photoUrl} size={52} />
        <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brandBlue text-[10px] font-bold text-white ring-2 ring-card">
          {index}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-textPrimary">{l.fullName}</p>
          <VerifiedBadge />
          {l.isDemo && <DemoBadge />}
        </div>
        <p className="mt-0.5 text-xs text-textSecondary">
          {l.yearsOfPractice} yrs · {l.enrolmentNumber} · {l.city}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {l.practiceAreas.slice(0, 3).map((a) => (
            <Chip key={a}>{label.practiceArea(a)}</Chip>
          ))}
          {l.practiceAreas.length > 3 && <Chip>+{l.practiceAreas.length - 3}</Chip>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-textSecondary">
          <span>Speaks {l.languages.map(label.language).join(", ")}</span>
          <LegalAidBadge panel={l.legalAidPanel} proBono={l.proBono} />
          {!l.acceptingClients && <span className="font-semibold text-amber-700 dark:text-amber-400">Not taking new requests</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between">
        {l.distanceKm !== null && (
          <span className="flex items-center gap-0.5 text-xs font-bold text-textPrimary">
            <MapPin className="h-3 w-3" aria-hidden />
            {formatDistance(l.distanceKm)}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-textSecondary transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}

const INDIA_CENTRE: [number, number] = [22.5, 79];

export function LawyerFinder() {
  const [location, setLocation] = useState<SavedLocation | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [results, setResults] = useState<{ lawyers: PublicLawyerCard[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/location")
      .then((r) => r.json())
      .then((j) => setLocation(j.success ? j.data.location : null))
      .catch(() => setLocation(null));
  }, []);

  const query = useMemo(() => {
    if (location === undefined) return null; // still loading the saved address
    const q = new URLSearchParams({ page: String(page) });
    if (location) {
      q.set("lat", String(location.latitude));
      q.set("lng", String(location.longitude));
    }
    if (filters.radiusKm && location) q.set("radiusKm", String(filters.radiusKm));
    if (filters.area) q.set("area", filters.area);
    if (filters.language) q.set("language", filters.language);
    if (filters.court) q.set("court", filters.court);
    if (filters.gender) q.set("gender", filters.gender);
    if (filters.legalAid) q.set("legalAid", "1");
    if (filters.available) q.set("available", "1");
    return q.toString();
  }, [location, filters, page]);

  const load = useCallback(async (q: string, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lawyers?${q}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Could not load lawyers.");
        return;
      }
      setResults((prev) => ({
        total: json.data.total,
        lawyers: append && prev ? [...prev.lawyers, ...json.data.lawyers] : json.data.lawyers,
      }));
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query) void load(query, page > 1);
  }, [query, load, page]);

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const activeFilterCount = [filters.area, filters.language, filters.court, filters.gender, filters.legalAid].filter(Boolean).length;

  const pins: Pin[] = useMemo(
    () =>
      (results?.lawyers ?? []).map((l, i) => ({
        id: l.id,
        latitude: l.latitude,
        longitude: l.longitude,
        title: l.fullName,
        subtitle: `${l.practiceAreas.slice(0, 2).map(label.practiceArea).join(", ")} · ${l.distanceKm !== null ? formatDistance(l.distanceKm) : ""}`,
        href: `/dashboard/lawyers/${l.id}`,
        index: i + 1,
        highlighted: hovered === l.id,
      })),
    [results, hovered]
  );

  if (location === undefined) {
    return <div className="h-40 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;
  }

  return (
    <div className="space-y-4">
      {/* Location + controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-borderCustom bg-card p-3">
        <MapPin className="h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm text-textPrimary">
          {location ? (
            <>
              Nearest to <span className="font-semibold">{location.label}</span>
            </>
          ) : (
            <span className="text-textSecondary">Add your address to see the nearest lawyers first</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setChanging((c) => !c)}
          aria-expanded={changing}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-brandBlue hover:bg-brandBlue/5"
        >
          {location ? "Change location" : "Add address"}
        </button>
        <div className="flex gap-1" role="radiogroup" aria-label="Distance">
          {([null, ...RADIUS_OPTIONS_KM] as (number | null)[]).map((r) => (
            <button
              key={r ?? "all"}
              type="button"
              role="radio"
              aria-checked={filters.radiusKm === r}
              disabled={r !== null && !location}
              title={r !== null && !location ? "Add your address to filter by distance" : undefined}
              onClick={() => setFilter("radiusKm", r)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                filters.radiusKm === r ? "border-brandBlue bg-brandBlue text-white" : "border-borderCustom text-textSecondary hover:text-textPrimary"
              )}
            >
              {r === null ? "All" : `${r} km`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-canvas"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
        <div className="flex rounded-xl border border-borderCustom p-0.5 lg:hidden" role="tablist" aria-label="View">
          {(
            [
              ["list", List],
              ["map", MapIcon],
            ] as const
          ).map(([v, Icon]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              aria-label={v === "list" ? "List view" : "Map view"}
              onClick={() => setView(v)}
              className={cn("rounded-lg p-1.5", view === v ? "bg-brandBlue text-white" : "text-textSecondary")}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {changing && (
        <section className="rounded-2xl border border-brandBlue/30 bg-card p-5" aria-label="Set your location">
          <p className="mb-3 text-sm text-textSecondary">Lawyers are sorted by distance from this place. It is saved to about 1 km and never shown to lawyers.</p>
          <div className="max-w-md">
            <LocationPicker
              onSaved={(l) => {
                setLocation(l);
                setChanging(false);
                setPage(1);
              }}
            />
          </div>
        </section>
      )}

      {showFilters && (
        <div className="grid gap-3 rounded-2xl border border-borderCustom bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-textSecondary">
            Problem area
            <select className={cn(selectCls, "mt-1")} value={filters.area} onChange={(e) => setFilter("area", e.target.value)}>
              <option value="">Any</option>
              {PRACTICE_AREAS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-textSecondary">
            Language
            <select className={cn(selectCls, "mt-1")} value={filters.language} onChange={(e) => setFilter("language", e.target.value)}>
              <option value="">Any</option>
              {LAWYER_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-textSecondary">
            Court
            <select className={cn(selectCls, "mt-1")} value={filters.court} onChange={(e) => setFilter("court", e.target.value)}>
              <option value="">Any</option>
              {COURTS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-textSecondary">
            Advocate
            <select className={cn(selectCls, "mt-1")} value={filters.gender} onChange={(e) => setFilter("gender", e.target.value)}>
              <option value="">Anyone</option>
              {GENDERS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-textPrimary">
            <input type="checkbox" className="h-4 w-4 accent-brandBlue" checked={filters.legalAid} onChange={(e) => setFilter("legalAid", e.target.checked)} />
            Free legal aid / pro bono only
          </label>
          <label className="flex items-center gap-2 text-sm text-textPrimary">
            <input type="checkbox" className="h-4 w-4 accent-brandBlue" checked={filters.available} onChange={(e) => setFilter("available", e.target.checked)} />
            Taking new requests
          </label>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setFilters({ ...EMPTY, radiusKm: filters.radiusKm, available: filters.available });
              }}
              className="justify-self-start text-xs font-semibold text-brandBlue"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-textSecondary">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Sorted by distance only. As Bar Council rules require, LegalSetu does not rank, rate or advertise advocates. Every listed
        advocate&apos;s enrolment has been checked by our team.
      </p>

      {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Advocates" aria-live="polite" className={cn("space-y-3", view === "map" && "hidden lg:block")}>
          <p className="text-xs font-semibold text-textSecondary">
            {results
              ? `${results.total} verified advocate${results.total === 1 ? "" : "s"}${filters.radiusKm ? ` within ${filters.radiusKm} km` : ""}${location ? " · nearest first" : " · A to Z"}`
              : "Searching…"}
          </p>
          {results?.lawyers.map((l, i) => (
            <LawyerCard key={l.id} l={l} index={i + 1} highlighted={hovered === l.id} onHover={setHovered} />
          ))}
          {results && results.lawyers.length < results.total && (
            <button
              type="button"
              disabled={loading}
              onClick={() => setPage((p) => p + 1)}
              className="w-full rounded-xl border border-borderCustom py-2.5 text-sm font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
            >
              Show more
            </button>
          )}
          {loading && !results && [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-borderCustom bg-card" />)}
          {loading && results && <Loader2 className="mx-auto h-5 w-5 animate-spin text-textSecondary" aria-label="Loading" />}
          {results && results.total === 0 && !loading && (
            <div className="rounded-2xl border border-borderCustom bg-card p-8 text-center">
              <p className="text-sm font-semibold text-textPrimary">No verified advocates match here yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-textSecondary">
                Try all distances or fewer filters. You can always get a free lawyer through the Legal Services Authority.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {filters.radiusKm !== null && (
                  <button
                    type="button"
                    onClick={() => setFilter("radiusKm", null)}
                    className="rounded-xl bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
                  >
                    Show all distances
                  </button>
                )}
                <a href="tel:15100" className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-4 py-2 text-xs font-semibold text-textPrimary">
                  <Phone className="h-3.5 w-3.5" aria-hidden /> Free legal aid: 15100
                </a>
              </div>
            </div>
          )}
        </section>

        <section aria-label="Map" className={cn("lg:sticky lg:top-6 lg:self-start", view === "list" && "hidden lg:block")}>
          <LawyerMap
            center={location ? [location.latitude, location.longitude] : INDIA_CENTRE}
            radiusKm={filters.radiusKm ?? undefined}
            fitToPins={filters.radiusKm === null}
            showCenter={Boolean(location)}
            pins={pins}
            height={520}
          />
        </section>
      </div>
    </div>
  );
}
