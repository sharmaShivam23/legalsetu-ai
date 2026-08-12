"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";

type Props = {
  duration?: number;
};

export default function Splash({ duration = 3500 }: Props) {
  // "visible" | "fading" | "done"
  // On re-navigation within the same session, skip splash entirely
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    // Check if splash has already been shown this session
    const alreadyShown = typeof window !== "undefined"
      && sessionStorage.getItem("legalsetu_splash_shown") === "1";

    if (alreadyShown) {
      // Skip instantly — don't block anything
      setPhase("done");
      return;
    }

    // Mark as shown so subsequent navigations skip it
    sessionStorage.setItem("legalsetu_splash_shown", "1");

    // Start fade-out 600ms before total duration ends
    const fadeTimer = setTimeout(() => setPhase("fading"), duration - 600);
    // Fully unmount after duration
    const doneTimer = setTimeout(() => setPhase("done"), duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [duration]);

  // Scroll-lock while splash is visible
  useEffect(() => {
    if (phase === "visible" || phase === "fading") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  // Fully done — render nothing
  if (phase === "done") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0B1120",
        opacity: phase === "fading" ? 0 : 1,
        pointerEvents: phase === "fading" ? "none" : "all",
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* Ambient glow blobs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700, height: 500,
            borderRadius: "100%",
            background: "rgba(99,102,241,0.15)",
            filter: "blur(100px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "30%", right: "20%",
            width: 400, height: 300,
            borderRadius: "100%",
            background: "rgba(59,130,246,0.10)",
            filter: "blur(80px)",
          }}
        />
      <div
        aria-hidden={!showing}
        style={{ pointerEvents: showing ? "auto" : "none" }}
        className={
          "fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity duration-300 " +
          (showing ? "opacity-100" : "opacity-0")
        }
      >
            width: 112, height: 112,
            borderRadius: "50%",
            background: "rgba(99,102,241,0.20)",
            animation: "splashPing 2s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />
        <span
          style={{
            position: "absolute",
            width: 80, height: 80,
            borderRadius: "50%",
            background: "rgba(99,102,241,0.12)",
            animation: "splashPing 2s cubic-bezier(0,0,0.2,1) 0.4s infinite",
          }}
        />

        {/* Logo */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: 80, height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, #818cf8, #4f46e5)",
            boxShadow: "0 0 40px rgba(99,102,241,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Scale style={{ width: 40, height: 40, color: "#fff" }} />
        </div>
      </div>

      {/* Brand name */}
      <h1
        style={{
          marginTop: 32,
          fontFamily: "serif",
          fontSize: 36,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.05em",
        }}
      >
        Legal<span style={{ color: "#818cf8" }}>Setu</span>
      </h1>

      {/* Tagline */}
      <p
        style={{
          marginTop: 10,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.15em",
          color: "#94a3b8",
          textTransform: "uppercase",
        }}
      >
        AI-Powered Legal Assistance
      </p>

      {/* Progress bar */}
      <div
        style={{
          marginTop: 48,
          width: 192,
          height: 2,
          borderRadius: 999,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #818cf8, #6366f1)",
            animation: `splashBar ${duration}ms linear forwards`,
          }}
        />
      </div>

      <style>{`
        @keyframes splashBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes splashPing {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
