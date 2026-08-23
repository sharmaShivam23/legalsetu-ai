// components/documents/ocr-stepper.tsx
"use client";

import { Check, Loader2, AlertTriangle, CircleDot } from "lucide-react";

export type OcrStepStatus = "pending" | "active" | "complete" | "error";

export interface OcrStep {
  label: string;
  description: string;
  status: OcrStepStatus;
}

export function OcrStepper({ steps }: { steps: OcrStep[] }) {
  // Find the exact step the engine is currently working on.
  // If all are complete, activeIndex is -1.
  const activeIndex = steps.findIndex((s) => s.status !== "complete");

  return (
    <div className="w-full pt-4 pb-20 px-2 sm:px-6">
      {/* 3D Laser & Pulse Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes laser-beam-travel {
          0% { transform: translateX(-100%); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(250%); opacity: 0; }
        }
        .laser-beam {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 50%;
          background: linear-gradient(90deg, transparent, #3b82f6, #93c5fd, #3b82f6, transparent);
          box-shadow: 0 0 20px #60a5fa, 0 0 40px #3b82f6;
          animation: laser-beam-travel 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          border-radius: 999px;
        }

        @keyframes node-pulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6); }
          70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .node-active-pulse {
          animation: node-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}} />

      <div className="relative flex w-full justify-between items-center">
        
        {/* --- BACKGROUND TRACK & LASER BEAMS --- */}
        <div className="absolute top-1/2 left-0 w-full h-1.5 -translate-y-1/2 flex items-center z-0 px-6 sm:px-8">
          {steps.map((_, idx) => {
            if (idx === steps.length - 1) return null; // No line after the last node
            
            // Logic to determine if this specific line segment should be solid or firing a laser
            const isSolid = activeIndex === -1 || idx < activeIndex - 1;
            const isFiringLaser = idx === activeIndex - 1;
            const isError = steps[activeIndex]?.status === "error" && isFiringLaser;
            
            return (
              <div key={idx} className="relative h-full flex-1 bg-slate-200 dark:bg-slate-800/80 overflow-hidden mx-1 rounded-full">
                
                {/* Solid Completed Fill */}
                <div 
                  className={`absolute inset-0 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)] transition-transform duration-1000 ease-in-out ${isSolid ? 'translate-x-0' : '-translate-x-full'}`} 
                />
                
                {/* Glowing Laser Effect for Active Transition */}
                {isFiringLaser && !isError && (
                  <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20">
                    <div className="laser-beam"></div>
                  </div>
                )}

                {/* Error State Line */}
                {isError && (
                  <div className="absolute inset-0 bg-red-500/20">
                    <div className="absolute top-0 bottom-0 left-0 w-full bg-red-500/40 animate-pulse"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* --- NODES --- */}
        {steps.map((step, idx) => {
          const isComplete = step.status === "complete";
          const isError = step.status === "error";
          // We consider it visually "active" if it is the current step the system is working on
          const isActive = idx === activeIndex && !isError;
          const isPending = idx > activeIndex && activeIndex !== -1;

          return (
            <div key={idx} className="relative z-10 flex flex-col items-center">
              
              {/* Node Circle */}
              <div 
                className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 transition-all duration-500 backdrop-blur-md
                  ${isComplete ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' : ''}
                  ${isActive ? 'bg-white dark:bg-slate-900 border-blue-500 text-blue-500 dark:text-blue-400 node-active-pulse' : ''}
                  ${isError ? 'bg-red-950 border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : ''}
                  ${isPending ? 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-300 dark:text-slate-600' : ''}
                `}
              >
                {isComplete && <Check className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />}
                {isActive && <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" strokeWidth={2.5} />}
                {isError && <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />}
                {isPending && <CircleDot className="h-4 w-4 sm:h-5 sm:w-5 opacity-50" />}
              </div>

              {/* Labels (Positioned absolutely below the node so flex spacing doesn't break) */}
              <div className="absolute top-14 sm:top-16 w-28 sm:w-32 text-center -ml-14 sm:-ml-16 left-1/2">
                <p 
                  className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-colors duration-300
                    ${isComplete ? 'text-slate-900 dark:text-white' : ''}
                    ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}
                    ${isError ? 'text-red-500' : ''}
                    ${isPending ? 'text-slate-400 dark:text-slate-600' : ''}
                  `}
                >
                  {step.label}
                </p>
                <p 
                  className={`mt-1.5 text-[9px] sm:text-[10px] font-medium leading-tight transition-colors duration-300 hidden sm:block
                    ${isActive ? 'text-blue-500 dark:text-blue-400/80' : 'text-slate-500 dark:text-slate-500'}
                  `}
                >
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}