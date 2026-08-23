"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disclaimer } from "@/components/common/disclaimer";
import { runLegalDocumentOCR } from "@/lib/ocr/ocr";
import { 
  FileText, 
  ShieldAlert, 
  Scale, 
  UploadCloud, 
  FileCheck2, 
  Loader2, 
  ArrowLeft,
  Sparkles,
  Fingerprint
} from "lucide-react";

type Screen = "select" | "upload" | "staged";

export const DOC_CATEGORIES = {
  "legal-notice": {
    label: "Legal Notice",
    description: "Upload a legal notice (sent or received) to understand its content and required response.",
    icon: FileText,
    color: "from-blue-500 to-indigo-500",
    shadow: "shadow-blue-500/20"
  },
  "fir-police-doc": {
    label: "FIR / Police Document",
    description: "Upload an FIR, police report, or complaint copy to identify key details and next steps.",
    icon: ShieldAlert,
    color: "from-emerald-500 to-teal-500",
    shadow: "shadow-emerald-500/20"
  },
  "court-order": {
    label: "Court Order",
    description: "Upload a court order or judgment to understand what it directs and any deadlines.",
    icon: Scale,
    color: "from-amber-500 to-orange-500",
    shadow: "shadow-amber-500/20"
  },
} as const;

export type DocCategory = keyof typeof DOC_CATEGORIES;
const CATEGORY_ORDER: DocCategory[] = ["legal-notice", "fir-police-doc", "court-order"];

export default function DocumentOcrPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("select");
  const [category, setCategory] = useState<DocCategory | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safely grab the active icon component based on the current category
  const ActiveIcon = category ? DOC_CATEGORIES[category].icon : null;

  function selectCategory(cat: DocCategory) {
    setCategory(cat);
    setScreen("upload");
    setErrorMsg(null);
  }

  function handleFileChosen(f: File) {
    setFile(f);
    setScreen("staged");
    setErrorMsg(null);
  }

  function goBack() {
    if (screen === "staged") setScreen("upload");
    else if (screen === "upload") {
      setScreen("select");
      setCategory(null);
    }
  }

  async function runAnalysis() {
    if (!file || !category) return;
    setIsUploading(true);
    setErrorMsg(null);

    try {
      const ocr = await runLegalDocumentOCR([file]);

      const uploadRes = await fetch("/api/documents", {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("category", category);
          fd.append("ocrText", ocr.rawText);
          fd.append("ocrConfidence", String(ocr.overallConfidence));
          return fd;
        })(),
      });

      if (!uploadRes.ok) throw new Error("Could not save the document. Please try again.");

      const uploadJson = await uploadRes.json();
      const id = uploadJson?.data?.id;
      if (!id) throw new Error("Upload succeeded but no document id was returned.");

      router.push(`/dashboard/documents/${id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50 dark:bg-[#070B14] font-sans selection:bg-blue-500/30 transition-colors duration-500">
      
      {/* 3D and Animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-container { perspective: 1200px; transform-style: preserve-3d; }
        
        .card-3d {
          transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
          transform-style: preserve-3d;
        }
        .card-3d:hover {
          transform: translateY(-10px) rotateX(5deg) rotateY(-2deg);
        }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.05);
        }
        .dark .glass-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .dropzone-pulse {
          animation: drop-pulse 3s infinite;
        }
        @keyframes drop-pulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        @keyframes scan-beam {
          0% { top: -10%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: 110%; opacity: 0; }
        }
        .scanner-line {
          position: absolute;
          left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, #3b82f6, transparent);
          box-shadow: 0 0 20px #3b82f6, 0 0 40px #3b82f6;
          animation: scan-beam 2.5s ease-in-out infinite;
          z-index: 50;
        }
      `}} />

      {/* Ambient Background */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>
      <div className="absolute top-0 left-1/4 h-[500px] w-[600px] rounded-full bg-blue-500/10 dark:bg-blue-600/20 blur-[120px] pointer-events-none transition-colors duration-500"></div>
      <div className="absolute bottom-0 right-1/4 h-[400px] w-[500px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-[100px] pointer-events-none transition-colors duration-500"></div>

      {/* Header HUD */}
      <header className="relative z-20 flex items-center justify-between border-b border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-950/40 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30">
            <FileCheck2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">LegalSetu Engine</p>
            <h1 className="font-serif text-lg font-bold text-slate-900 dark:text-white">Document OCR AI</h1>
          </div>
        </div>
        <Badge className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-none shadow-none font-mono text-xs hidden sm:flex">
          VISION_MODEL_ACTIVE
        </Badge>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 perspective-container">
        
        {/* State 1: Category Selection */}
        {screen === "select" && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="glass-panel mb-10 rounded-3xl p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">What would you like to analyze?</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-2xl">
                    Our AI extracts text directly on your device. We never store your raw images—only the extracted text is sent to our secure models to provide a plain-language summary and legal breakdown.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {CATEGORY_ORDER.map((cat) => {
                const config = DOC_CATEGORIES[cat];
                const Icon = config.icon;
                return (
                  <div key={cat} className="card-3d h-full cursor-pointer" onClick={() => selectCategory(cat)}>
                    <div className={`relative h-full overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 p-6 backdrop-blur-md shadow-lg transition-colors hover:border-blue-400/50 dark:hover:border-blue-500/50 hover:${config.shadow}`}>
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Icon className="h-24 w-24" />
                      </div>
                      <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${config.color} text-white shadow-inner`}>
                        <Icon className="h-7 w-7" />
                      </div>
                      <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">{config.label}</h3>
                      <p className="mb-8 text-sm text-slate-600 dark:text-slate-400 relative z-10">{config.description}</p>
                      
                      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-sm font-bold text-blue-600 dark:text-blue-400">
                        <span>Select Module</span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                          →
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* State 2: Upload Interface */}
        {screen === "upload" && category && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-3xl mx-auto">
            <button 
              onClick={goBack}
              className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to modules
            </button>
            
            <div className="mb-8 flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${DOC_CATEGORIES[category].color} text-white shadow-lg`}>
                {ActiveIcon && <ActiveIcon className="h-6 w-6" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{DOC_CATEGORIES[category].label}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Initialize secure document transfer</p>
              </div>
            </div>

            <div
              className="glass-panel group relative flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-300 dark:border-slate-700 transition-all hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileChosen(f);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-b from-transparent to-blue-50/20 dark:to-blue-900/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="dropzone-pulse mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <UploadCloud className="h-10 w-10" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Drag & drop your document</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">or click anywhere to browse files</p>
              
              <div className="mt-8 flex items-center gap-4">
                <Badge variant="outline" className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">JPG</Badge>
                <Badge variant="outline" className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">PNG</Badge>
                <Badge variant="outline" className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">PDF</Badge>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                }}
              />
            </div>
          </div>
        )}

        {/* State 3: Staged / Processing Interface */}
        {screen === "staged" && file && category && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-2xl mx-auto">
            <button 
              onClick={goBack}
              disabled={isUploading}
              className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" /> Change file
            </button>

            <div className={`glass-panel relative overflow-hidden rounded-[2.5rem] p-8 sm:p-12 text-center transition-all ${isUploading ? 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.15)]' : ''}`}>
              
              {/* Animated Scanner (Only visible when loading) */}
              {isUploading && (
                <>
                  <div className="scanner-line"></div>
                  <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10 animate-pulse"></div>
                </>
              )}

              <div className="relative z-10 flex flex-col items-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-inner">
                  {isUploading ? (
                    <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                  ) : (
                    <FileText className="h-10 w-10 text-slate-700 dark:text-slate-300" />
                  )}
                </div>
                
                <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white break-all line-clamp-1">{file.name}</h3>
                <p className="mb-8 font-mono text-sm text-slate-500 dark:text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB • {DOC_CATEGORIES[category].label}
                </p>

                {errorMsg && (
                  <div className="mb-8 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {errorMsg}
                  </div>
                )}

                <div className="flex w-full flex-col sm:flex-row justify-center gap-4">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    variant="outline"
                    className="h-14 rounded-2xl border-slate-300 dark:border-slate-700 bg-transparent px-8 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Select Different File
                  </Button>
                  <Button
                    onClick={runAnalysis}
                    disabled={isUploading}
                    className="group relative h-14 overflow-hidden rounded-2xl bg-blue-600 px-10 font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 disabled:opacity-80"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {isUploading ? "Extracting Intelligence..." : "Run AI Analysis"}
                      {!isUploading && <Fingerprint className="h-4 w-4" />}
                    </span>
                    {!isUploading && (
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[scan-beam_1.5s_ease-in-out]"></div>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-16 flex justify-center opacity-80 hover:opacity-100 transition-opacity">
          <Disclaimer className="max-w-xl text-center" />
        </div>
      </main>
    </div>
  );
}