"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A lightweight pointer-tracking 3D tilt wrapper — pure CSS transforms,
 * no charting/3D library. Used across the dashboard's premium sections
 * (Legal Aid, Saved Sources, History, Settings) for a consistent, tactile
 * "held in the hand" feel on hover, disabled entirely for touch/reduced
 * motion so it never gets in the way on mobile or for accessibility.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 8,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [glareStyle, setGlareStyle] = useState<CSSProperties>({ opacity: 0 });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * maxTilt * 2;
    const ry = (px - 0.5) * maxTilt * 2;
    setStyle({
      transform: `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.015,1.015,1.015)`,
      transition: "transform 60ms linear",
    });
    if (glare) {
      setGlareStyle({
        opacity: 1,
        background: `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.18), transparent 55%)`,
      });
    }
  }

  function handleLeave() {
    setStyle({ transform: "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)", transition: "transform 350ms ease" });
    setGlareStyle({ opacity: 0, transition: "opacity 350ms ease" });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transformStyle: "preserve-3d", willChange: "transform", ...style }}
      className={cn("relative", className)}
    >
      {children}
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={glareStyle}
        />
      )}
    </div>
  );
}
