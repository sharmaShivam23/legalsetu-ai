"use client";

// ==========================================================
// LegalSetu — the pen that travels the page
// ----------------------------------------------------------
// One object, present the whole way down. It does NOT track the
// scrollbar continuously — that reads as the thing drifting to a
// random spot on every section. Instead each section owns a fixed
// docking position: when a section becomes the active one the pen
// glides to that section's slot and then STAYS there, perfectly
// still, until the next section takes over.
//
// Every dock is expressed as a fraction of the viewport, so the
// same slot holds on any screen size, and slots sit in the margins
// beside the centred content column rather than on top of it.
// ==========================================================

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Dock {
  /** Section this slot belongs to. */
  id: string;
  /** Fraction of viewport width / height for the pen's centre. */
  x: number;
  y: number;
  rot: number;
  scale: number;
}

const DOCKS: Dock[] = [
  { id: "hero", x: 0.83, y: 0.52, rot: -8, scale: 1.0 },
  { id: "what-is-this", x: 0.09, y: 0.42, rot: 12, scale: 0.72 },
  { id: "how-it-works", x: 0.91, y: 0.3, rot: -12, scale: 0.78 },
  { id: "languages", x: 0.12, y: 0.32, rot: 14, scale: 0.62 },
  { id: "features", x: 0.9, y: 0.2, rot: -10, scale: 0.66 },
  { id: "facts", x: 0.08, y: 0.5, rot: 9, scale: 0.68 },
  { id: "trust", x: 0.91, y: 0.6, rot: -14, scale: 0.8 },
  // Sits in the empty band above the footer columns, not on the brand text.
  { id: "site-footer", x: 0.86, y: 0.3, rot: -9, scale: 0.7 },
];

const PEN_WIDTH = 210;
const PEN_HEIGHT = Math.round((856 / 620) * PEN_WIDTH);

export default function PenCompanion() {
  const positionRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const activeDock = useRef(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = positionRef.current;
    if (!el) return undefined;

    gsap.registerPlugin(ScrollTrigger);

    const toPixels = (dock: Dock) => ({
      x: dock.x * window.innerWidth - PEN_WIDTH / 2,
      y: dock.y * window.innerHeight - PEN_HEIGHT / 2,
    });

    // Place it at the hero slot immediately, then fade/scale it in.
    const first = toPixels(DOCKS[0]);
    gsap.set(el, { x: first.x, y: first.y, rotate: DOCKS[0].rot, scale: 0.6, opacity: 0 });
    gsap.to(el, { scale: DOCKS[0].scale, opacity: 1, duration: 1.1, ease: "power3.out", delay: 0.35 });

    const moveTo = (index: number, instant = false) => {
      const dock = DOCKS[index];
      const target = document.getElementById(dock.id);
      if (!target) return;
      activeDock.current = index;
      const { x, y } = toPixels(dock);
      gsap.to(el, {
        x,
        y,
        rotate: dock.rot,
        scale: dock.scale,
        duration: instant ? 0 : 1.15,
        ease: "power3.inOut",
        overwrite: "auto",
      });
    };

    const triggers = DOCKS.map((dock, index) => {
      const target = document.getElementById(dock.id);
      if (!target) return null;
      return ScrollTrigger.create({
        trigger: target,
        start: "top 60%",
        end: "bottom 40%",
        onEnter: () => moveTo(index),
        onEnterBack: () => moveTo(index),
      });
    }).filter(Boolean) as ScrollTrigger[];

    // Gentle idle life, on a separate element so it never fights the
    // docking tween running on the parent.
    const float = gsap.to(floatRef.current, {
      y: -14,
      rotate: 3,
      duration: 3.2,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    const onResize = () => moveTo(activeDock.current, true);
    window.addEventListener("resize", onResize);
    ScrollTrigger.refresh();

    return () => {
      window.removeEventListener("resize", onResize);
      triggers.forEach((t) => t.kill());
      float.kill();
      gsap.killTweensOf(el);
    };
  }, [enabled]);

  if (enabled !== true) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[6] overflow-hidden" aria-hidden="true">
      <div ref={positionRef} className="absolute left-0 top-0 will-change-transform">
        <div ref={floatRef}>
          <Image
            src="/pen.png"
            alt=""
            width={PEN_WIDTH}
            height={PEN_HEIGHT}
            priority
            className="select-none drop-shadow-[0_18px_45px_rgba(37,99,235,0.35)]"
          />
        </div>
      </div>
    </div>
  );
}
