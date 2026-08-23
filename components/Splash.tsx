"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";

type Props = { duration?: number };

export default function Splash({ duration = 3500 }: Props) {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    const already =
      typeof window !== "undefined" &&
      sessionStorage.getItem("legalsetu_splash_shown") === "1";
    if (already) {
      setPhase("done");
      return;
    }
    sessionStorage.setItem("legalsetu_splash_shown", "1");

    const fadeTimer = setTimeout(
      () => setPhase("fading"),
      Math.max(0, duration - 600)
    );
    const doneTimer = setTimeout(() => setPhase("done"), duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [duration]);

  useEffect(() => {
    if (phase === "visible" || phase === "fading")
      document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden={phase !== "visible"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc", // slate-50
        opacity: phase === "fading" ? 0 : 1,
        pointerEvents: phase === "fading" ? "none" : "auto",
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* Background Glow Effects */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 500,
            borderRadius: "100%",
            background: "rgba(99, 102, 241, 0.08)", // subtle indigo glow
            filter: "blur(100px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "30%",
            right: "20%",
            width: 400,
            height: 300,
            borderRadius: "100%",
            background: "rgba(59, 130, 246, 0.06)", // subtle blue glow
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* Animated Icon Container */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 112,
            height: 112,
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.12)",
            animation: "splashPing 2s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.08)",
            animation: "splashPing 2s cubic-bezier(0,0,0.2,1) 0.4s infinite",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            boxShadow: "0 10px 25px -5px rgba(79, 70, 229, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Scale style={{ width: 40, height: 40, color: "#ffffff" }} />
        </div>
      </div>

      {/* Title & Subtitle */}
      <h1
        style={{
          marginTop: 32,
          fontFamily: "serif",
          fontSize: 36,
          fontWeight: 700,
          color: "#0f172a", // slate-900
          letterSpacing: "0.05em",
        }}
      >
        Legal<span style={{ color: "#4f46e5" }}>Setu</span>
      </h1>

      <p
        style={{
          marginTop: 10,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.15em",
          color: "#64748b", // slate-500
          textTransform: "uppercase",
        }}
      >
        AI-Powered Legal Assistance
      </p>

      {/* Progress Bar */}
      <div
        style={{
          marginTop: 48,
          width: 192,
          height: 3,
          borderRadius: 999,
          background: "#e2e8f0", // slate-200
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #6366f1, #4f46e5)",
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