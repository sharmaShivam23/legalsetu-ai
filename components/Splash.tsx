"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";

type Props = { duration?: number };

export default function Splash({ duration = 3500 }: Props) {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    // Check if the splash screen has already been shown in this session
    const already =
      typeof window !== "undefined" &&
      sessionStorage.getItem("legalsetu_splash_shown") === "1";
      
    if (already) {
      setPhase("done");
      return;
    }
    
    sessionStorage.setItem("legalsetu_splash_shown", "1");

    // Start fade out slightly before the full duration
    const fadeTimer = setTimeout(
      () => setPhase("fading"),
      Math.max(0, duration - 600)
    );
    
    // Completely unmount when duration finishes
    const doneTimer = setTimeout(() => setPhase("done"), duration);
    
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [duration]);

  useEffect(() => {
    // Lock scrolling while splash is active
    if (phase === "visible" || phase === "fading") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden={phase !== "visible"}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#070B14] overflow-hidden"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        pointerEvents: phase === "fading" ? "none" : "auto",
        transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* 3D Engine & Animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .splash-scene { perspective: 1200px; transform-style: preserve-3d; }
        
        .splash-object { 
          position: relative; 
          transform-style: preserve-3d; 
          animation: spin-3d 4s cubic-bezier(0.25, 1, 0.5, 1) infinite; 
        }
        
        @keyframes spin-3d {
          0% { transform: rotateX(15deg) rotateY(-180deg); }
          100% { transform: rotateX(15deg) rotateY(180deg); }
        }
        
        @keyframes progress-fill {
          0% { width: 0%; left: 0; }
          100% { width: 100%; left: 0; }
        }
        
        @keyframes text-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        
        .animate-shimmer {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.7) 0%,
            rgba(255,255,255,1) 50%,
            rgba(255,255,255,0.7) 100%
          );
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: text-shimmer 2.5s linear infinite;
        }
      `}} />

      {/* Background Grid & Glowing Orbs */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"></div>
      
      <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute top-1/3 right-1/4 h-[300px] w-[300px] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none"></div>

      {/* Main 3D Container */}
      <div className="splash-scene z-10 flex flex-col items-center">
        
        {/* Extruded 3D Logo */}
        <div className="splash-object mb-12 h-24 w-24">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translateZ(${i * -4}px)`,
                opacity: 1 - i * 0.1,
                filter: i === 0 ? "drop-shadow(0 0 25px rgba(59,130,246,0.8))" : "none",
              }}
            >
              <Scale 
                className={`h-24 w-24 ${i === 0 ? "text-white" : "text-blue-600"}`} 
                strokeWidth={1.5}
              />
            </div>
          ))}
        </div>

        {/* Typography */}
        <div className="mt-8 flex flex-col items-center">
          <h1 className="animate-shimmer font-serif text-5xl font-bold tracking-widest text-white drop-shadow-lg">
            LEGALSETU
          </h1>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-slate-400">
            Initializing AI Engine
          </p>
        </div>

        {/* Cyberpunk Loading Bar */}
        <div className="mt-12 h-1 w-56 overflow-hidden rounded-full bg-slate-800/80 relative shadow-inner">
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 via-blue-400 to-indigo-400 shadow-[0_0_15px_rgba(59,130,246,0.9)]"
            style={{ 
              animation: `progress-fill ${Math.max(0, duration - 200)}ms cubic-bezier(0.76, 0, 0.24, 1) forwards` 
            }}
          ></div>
        </div>
        
      </div>
    </div>
  );
}