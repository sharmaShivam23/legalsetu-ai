"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";

export default function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Unmount entirely from the DOM at 4.5s, 
    // strictly AFTER the CSS animation has already hidden it.
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 4500);

    return () => clearTimeout(removeTimer);
  }, []);

  // Remove from HTML once animation is fully complete
  if (!isVisible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* 1. CSS Fade-Out Guarantee */
        .splash-wrapper {
          animation: fadeOutSplash 4s ease-in-out forwards;
        }
        
        @keyframes fadeOutSplash {
          0% { opacity: 1; visibility: visible; }
          80% { opacity: 1; visibility: visible; } /* Stays solid for 3.2s */
          100% { opacity: 0; visibility: hidden; pointer-events: none; } /* Fades away by 4s */
        }

        /* 2. 3D Scene Setup */
        .splash-scene { perspective: 1200px; transform-style: preserve-3d; }
        .splash-object { position: relative; transform-style: preserve-3d; animation: spin-3d 4s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
        
        @keyframes spin-3d {
          0% { transform: rotateX(15deg) rotateY(-180deg); }
          100% { transform: rotateX(15deg) rotateY(180deg); }
        }
        
        /* 3. Loading Bar Animation */
        @keyframes progress-fill {
          0% { width: 0%; left: 0; }
          100% { width: 100%; left: 0; }
        }
        .splash-progress { animation: progress-fill 3.3s cubic-bezier(0.76, 0, 0.24, 1) forwards; }
      `}} />

      <div className="splash-wrapper fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-slate-50">
        
        {/* Subtle Grid Background for Light Mode */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        
        {/* Soft Glowing Light Blue Orb */}
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/20 blur-[90px]"></div>

        <div className="splash-scene z-10 flex flex-col items-center">
          {/* 3D Extruded Logo configured for Light Mode */}
          <div className="splash-object mb-12 h-24 w-24">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateZ(${i * -4}px)`,
                  opacity: 1 - i * 0.1,
                  filter: i === 0 ? "drop-shadow(0 10px 15px rgba(37,99,235,0.25))" : "none",
                }}
              >
                <Scale 
                  className={`h-24 w-24 ${i === 0 ? "text-blue-600" : "text-blue-300"}`} 
                  strokeWidth={1.5}
                />
              </div>
            ))}
          </div>

          {/* Typography */}
          <div className="mt-8 flex flex-col items-center">
            <h1 className="font-serif text-4xl font-bold tracking-widest text-slate-900 drop-shadow-sm">
              LEGALSETU
            </h1>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Initializing AI Engine
            </p>
          </div>

          {/* Loading Bar */}
          <div className="mt-10 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 relative shadow-inner">
            <div className="splash-progress absolute left-0 top-0 h-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
          </div>
        </div>
      </div>
    </>
  );
}