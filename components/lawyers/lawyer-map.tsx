"use client";

// Leaflet touches `window` at import time, so this module is only ever
// loaded through next/dynamic with ssr:false (see ./map.tsx).

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  href?: string;
  /** Number shown in the pin (list position). */
  index?: number;
  highlighted?: boolean;
}

/** CSS-only markers: Leaflet's default PNG icons break under bundlers. */
function pinIcon(pin: MapPin) {
  const label = pin.index !== undefined ? String(pin.index) : "";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${pin.highlighted ? "#e11d48" : "#2563eb"};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"><span style="transform:rotate(45deg);color:#fff;font:700 12px system-ui">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

const youIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 6px rgba(16,185,129,.25)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function FitTo({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm?: number }) {
  const map = useMap();
  // Depends on the numbers, not the array, so a re-render with the same
  // centre never yanks the map away from where the user panned it.
  useEffect(() => {
    if (radiusKm) {
      map.fitBounds(L.latLng(lat, lng).toBounds(radiusKm * 2000), { padding: [12, 12] });
    } else {
      map.setView([lat, lng], Math.max(map.getZoom(), 14));
    }
  }, [map, lat, lng, radiusKm]);
  return null;
}

/** Zooms to show every pin (and the search location), e.g. for "All distances". */
function FitPins({ points }: { points: [number, number][] }) {
  const map = useMap();
  // A string key, so the same set of points never re-fits the map.
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 13);
    else map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 14 });
  }, [map, key]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LawyerMap({
  center,
  radiusKm,
  pins = [],
  showCenter = true,
  height = 420,
  onPick,
  fitToPins = false,
  ariaLabel = "Map of advocates",
}: {
  center: [number, number];
  radiusKm?: number;
  pins?: MapPin[];
  showCenter?: boolean;
  height?: number;
  /** When set, clicking the map (or dragging the single pin) picks a point. */
  onPick?: (lat: number, lng: number) => void;
  /** Zoom to fit all pins instead of the radius circle. */
  fitToPins?: boolean;
  ariaLabel?: string;
}) {
  const icons = useMemo(() => new Map(pins.map((p) => [p.id, pinIcon(p)])), [pins]);
  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl border border-borderCustom" role="region" aria-label={ariaLabel}>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
        {fitToPins && pins.length > 0 ? (
          <FitPins points={[...pins.map((p) => [p.latitude, p.longitude] as [number, number]), ...(showCenter ? [center] : [])]} />
        ) : (
          <FitTo lat={center[0]} lng={center[1]} radiusKm={radiusKm} />
        )}
        {radiusKm && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.04 }} />}
        {showCenter && <Marker position={center} icon={youIcon} title="Your search location" />}
        {onPick && <ClickToPlace onPick={onPick} />}
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={icons.get(p.id)!}
            title={p.title}
            draggable={Boolean(onPick)}
            eventHandlers={
              onPick
                ? {
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      onPick(ll.lat, ll.lng);
                    },
                  }
                : undefined
            }
          >
            {!onPick && (
              <Popup>
                <strong>{p.title}</strong>
                {p.subtitle && <div style={{ marginTop: 2 }}>{p.subtitle}</div>}
                {p.href && (
                  <a href={p.href} style={{ display: "inline-block", marginTop: 6, fontWeight: 600 }}>
                    View profile →
                  </a>
                )}
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
