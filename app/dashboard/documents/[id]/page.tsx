"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disclaimer } from "@/components/common/disclaimer";
import { OcrStepper, type OcrStep } from "@/components/documents/ocr-stepper";
import { DOC_CATEGORIES, type DocCategory } from "@/app/dashboard/documents/page";
import { 
  ArrowLeft, 
  Cpu, 
  RefreshCw, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  ListChecks,
  AlertTriangle,
  FileCheck2
} from "lucide-react";

interface AnalysisResult {
  caseName: string;
  judge: string;
  date: string;
  decisionSummary: string;
  keyFindings: string[];
  nextSteps: string[];
}

type AnalysisStatus = "PENDING" | "COMPLETE" | "DEGRADED";

interface DocumentRecord {
  id: string;
  fileName: string;
  fileSizeKb: number;
  category: string;
  ocrText: string;
  ocrConfidenceNote: string;
  analysisStatus: AnalysisStatus;
  analysis: AnalysisResult | null;
}

type Phase = "loading-doc" | "analyzing" | "done" | "error";

function normalizeCategory(raw: string | null | undefined): DocCategory {
  const FALLBACK: DocCategory = "legal-notice";
  if (!raw) return FALLBACK;
  if (raw in DOC_CATEGORIES) return raw as DocCategory;
  const hyphenated = raw.toLowerCase().replace(/_/g, "-");
  if (hyphenated in DOC_CATEGORIES) return hyphenated as DocCategory;
  return FALLBACK;
}

function buildSteps(phase: Phase): OcrStep[] {
  const aiUploadDone = phase !== "loading-doc";
  return [
    { label: "Upload", description: "Document received", status: "complete" },
    { label: "Extract Text", description: "OCR complete", status: "complete" },
    {
      label: "AI Upload",
      description: aiUploadDone ? "Sent to AI" : "Waiting…",
      status: phase === "loading-doc" ? "pending" : "complete",
    },
    {
      label: "AI Analysis",
      description: phase === "analyzing" ? "Running now…" : phase === "error" ? "Failed" : phase === "done" ? "Complete" : "Waiting…",
      status: phase === "loading-doc" ? "pending" : phase === "analyzing" ? "active" : phase === "error" ? "error" : "complete",
    },
  ];
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading-doc");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [quotaCooldown, setQuotaCooldown] = useState(0);

  useEffect(() => {
    if (quotaCooldown <= 0) return;
    const t = setTimeout(() => setQuotaCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [quotaCooldown]);

  const hasRunForId = useRef<string | null>(null);

  async function runAnalyze(force: boolean): Promise<{ result: AnalysisResult; degraded: boolean }> {
    const analyzeRes = await fetch(`/api/documents/${id}/analyze${force ? "?force=1" : ""}`, {
      method: "POST",
    });

    if (analyzeRes.status === 429) {
      const body = await analyzeRes.json().catch(() => ({}) as any);
      setQuotaCooldown(body?.retryDelaySeconds ?? 60);
      throw new Error(body?.message ?? "The AI service is at its usage limit right now. Please try again shortly.");
    }

    if (!analyzeRes.ok) throw new Error("Analysis failed. Please try again.");
    const analyzeJson = await analyzeRes.json();
    const result: AnalysisResult | undefined = analyzeJson?.data?.result;
    if (!result) throw new Error("Analysis didn't return a result. Please try again.");
    return { result, degraded: !!analyzeJson?.data?.degraded };
  }

  useEffect(() => {
    if (hasRunForId.current === id) return;
    hasRunForId.current = id;

    async function load() {
      try {
        const res = await fetch(`/api/documents/${id}`);
        if (!res.ok) throw new Error("Couldn't load this document.");
        const json = await res.json();
        const docData: DocumentRecord | undefined = json?.data;
        if (!docData) throw new Error("Couldn't load this document.");
        setDoc(docData);

        if (docData.analysisStatus === "PENDING" || !docData.analysis) {
          setPhase("analyzing");
          const { result } = await runAnalyze(false);
          setDoc((prev) => (prev ? { ...prev, analysis: result, analysisStatus: "COMPLETE" } : prev));
        }
        setPhase("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    }
    load();
  }, [id]);

  async function handleReanalyze() {
    setIsReanalyzing(true);
    setErrorMsg(null);
    try {
      const { result, degraded } = await runAnalyze(true);
      setDoc((prev) =>
        prev ? { ...prev, analysis: result, analysisStatus: degraded ? "DEGRADED" : "COMPLETE" } : prev
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Re-analysis failed. Please try again.");
    } finally {
      setIsReanalyzing(false);
    }
  }

  // --- RENDERING HELPERS ---
  const renderBackground = () => (
    <>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none z-0"></div>
      <div className="absolute top-0 left-1/4 h-[500px] w-[600px] rounded-full bg-blue-500/10 dark:bg-blue-600/10 blur-[120px] pointer-events-none transition-colors duration-500 z-0"></div>
      <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[500px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-[100px] pointer-events-none transition-colors duration-500 z-0"></div>
    </>
  );

  const renderHeader = () => (
    <header className="relative z-20 flex items-center justify-between border-b border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-950/40 px-6 py-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30">
          <FileCheck2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">LegalSetu Engine</p>
          <h1 className="font-serif text-lg font-bold text-slate-900 dark:text-white">Document Analysis</h1>
        </div>
      </div>
      <Badge className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-none shadow-none font-mono text-xs hidden sm:flex items-center gap-1.5">
        <Cpu className="h-3 w-3" /> AI_INFERENCE_ACTIVE
      </Badge>
    </header>
  );

  if (phase === "error" || (phase !== "loading-doc" && phase !== "analyzing" && !doc)) {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50 dark:bg-[#070B14] font-sans flex flex-col transition-colors duration-500">
        {renderBackground()}
        {renderHeader()}
        <div className="flex flex-1 items-center justify-center relative z-10 px-6">
          <div className="glass-panel flex flex-col items-center rounded-3xl p-10 text-center border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
            <ShieldAlert className="h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Analysis Interrupted</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{errorMsg || "Document not found or could not be loaded."}</p>
            <Button onClick={() => router.push("/dashboard/documents")} className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900">
              Return to Documents
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Define Category Safely
  const categoryKey = doc ? normalizeCategory(doc.category) : "legal-notice";
  const category = DOC_CATEGORIES[categoryKey];
  const ActiveIcon = category.icon;
  const isDegraded = doc?.analysisStatus === "DEGRADED";

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50 dark:bg-[#070B14] font-sans transition-colors duration-500">
      
      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-container { perspective: 1200px; transform-style: preserve-3d; }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.05);
        }
        .dark .glass-panel {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .data-node {
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(226, 232, 240, 1);
          border-radius: 1.25rem;
          transition: all 0.3s ease;
        }
        .dark .data-node {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .data-node:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px -10px rgba(59, 130, 246, 0.1);
        }

        @keyframes scan-beam {
          0% { top: 0%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scanner-line {
          position: absolute;
          left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, #3b82f6, transparent);
          box-shadow: 0 0 15px #3b82f6;
          animation: scan-beam 2.5s ease-in-out infinite;
          z-index: 10;
        }
      `}} />

      {renderBackground()}
      {renderHeader()}

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 perspective-container">
        
        {/* Navigation & Stepper */}
        <div className="mb-8">
          <button 
            onClick={() => router.push("/dashboard/documents")}
            className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Analyze another document
          </button>
          
          <div className="glass-panel rounded-2xl p-4 sm:p-6 mb-8">
             <OcrStepper steps={buildSteps(phase)} />
          </div>
        </div>

        {/* Loading State */}
        {(phase === "loading-doc" || !doc) ? (
          <div className="animate-in fade-in zoom-in-95 duration-500 glass-panel relative overflow-hidden rounded-[2rem] p-12 text-center flex flex-col items-center border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.1)]">
            <div className="scanner-line"></div>
            <div className="mb-6 relative flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700">
              <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
              <Cpu className="h-10 w-10 text-blue-500 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Synthesizing Document</h2>
            <p className="text-sm font-mono text-slate-500 dark:text-slate-400">Extracting legal entities and parameters...</p>
          </div>
        ) : (
          
          /* Render Active Document */
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Meta Header */}
            <div className="mb-8 flex items-center gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${category.color} text-white shadow-lg`}>
                <ActiveIcon className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{category.label}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-mono text-[10px] uppercase">
                    {(doc.fileSizeKb).toFixed(0)} KB
                  </Badge>
                  <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{doc.fileName}</span>
                </div>
              </div>
            </div>

            {/* Extracted OCR Text Toggle */}
            <div className="mb-8">
              <button
                className="group flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                onClick={() => setShowExtractedText((v) => !v)}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 group-hover:bg-blue-200 dark:group-hover:bg-blue-500/30 transition-colors">
                  {showExtractedText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
                View Raw Extracted Text (OCR)
              </button>
              
              <div className={`mt-3 overflow-hidden transition-all duration-500 ease-in-out ${showExtractedText ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="glass-panel rounded-2xl p-5 border-blue-200 dark:border-blue-500/20">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Raw Device Extraction</span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{doc.ocrConfidenceNote}</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-2 text-xs font-mono leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                    {doc.ocrText}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary Section */}
            {doc.analysis ? (
              <div className={`glass-panel relative overflow-hidden rounded-[2rem] border-t-4 ${isDegraded ? 'border-t-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.1)]' : 'border-t-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.1)]'}`}>
                
                {/* Header Banner */}
                <div className={`px-8 py-5 border-b flex items-center justify-between ${isDegraded ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'}`}>
                  <div className="flex items-center gap-2">
                    {isDegraded ? <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" /> : <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                    <h3 className={`font-serif text-lg font-bold ${isDegraded ? 'text-amber-900 dark:text-amber-300' : 'text-blue-900 dark:text-blue-300'}`}>
                      {isDegraded ? "AI Intelligence (Partial/Degraded)" : "AI Intelligence Report"}
                    </h3>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  {isDegraded && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                        The AI engine could not fully process this document's complex layout during the last pass. Review the extracted fields carefully. You can request a manual re-analysis below.
                      </p>
                    </div>
                  )}

                  {/* Data Nodes Grid */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Subject / Case Name" value={doc.analysis.caseName} />
                    <Field label="Authority / Judge" value={doc.analysis.judge} />
                    <Field label="Filing / Order Date" value={doc.analysis.date} />
                    <Field label="Executive Summary" value={doc.analysis.decisionSummary} className="sm:col-span-2" />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 pt-4">
                    <Field label="Key Findings & Obligations" items={doc.analysis.keyFindings} icon={ListChecks} />
                    <Field label="Recommended Next Steps" items={doc.analysis.nextSteps} icon={CheckCircle2} />
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-200 dark:border-white/10">
                    <Disclaimer />
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center gap-4 pt-4">
                    {isDegraded && (
                      <Button
                        className="rounded-xl bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                        onClick={handleReanalyze}
                        disabled={isReanalyzing || quotaCooldown > 0}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isReanalyzing ? 'animate-spin' : ''}`} />
                        {isReanalyzing
                          ? "Re-analyzing Neural Core…"
                          : quotaCooldown > 0
                            ? `Cooldown: ${quotaCooldown}s`
                            : "Force Re-analyze"}
                      </Button>
                    )}
                    
                    {errorMsg && <p className="text-sm font-bold text-red-500 animate-pulse">{errorMsg}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel flex flex-col items-center justify-center rounded-[2rem] p-12 text-center h-[400px]">
                <div className="relative mb-6 h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700"></div>
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                </div>
                <p className="font-bold text-slate-900 dark:text-white text-lg">Synthesizing Neural Summary</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Parsing complex legalese into plain language...</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// --- HOLOGRAPHIC FIELD COMPONENT ---
function Field({ label, value, items, className = "", icon: Icon }: { label: string; value?: string; items?: string[]; className?: string; icon?: any }) {
  return (
    <div className={`data-node p-5 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 text-blue-500" />}
        {label}
      </div>
      
      {value !== undefined && (
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
          {value || <span className="text-slate-400 italic">Not detected in document</span>}
        </p>
      )}
      
      {items !== undefined && (
        items.length > 0 ? (
          <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
           <p className="text-sm text-slate-400 italic">No specific items detected.</p>
        )
      )}
    </div>
  );
}