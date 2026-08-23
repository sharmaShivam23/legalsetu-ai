// app/dashboard/documents/[id]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/common/disclaimer";
import { OcrStepper, type OcrStep } from "@/components/documents/ocr-stepper";
import { DOC_CATEGORIES, type DocCategory } from "@/app/dashboard/documents/page";

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
  category: string; // widened — raw server value isn't guaranteed to already match DocCategory
  ocrText: string;
  ocrConfidenceNote: string;
  analysisStatus: AnalysisStatus;
  analysis: AnalysisResult | null;
}

type Phase = "loading-doc" | "analyzing" | "done" | "error";

// Handles the value coming back as either the hyphenated UI form
// ("legal-notice") or the raw Prisma enum ("LEGAL_NOTICE") — whichever
// the API actually sends, this always resolves to a valid DOC_CATEGORIES
// entry so the page can never crash on category.icon/.label again.
function normalizeCategory(raw: string | null | undefined): DocCategory {
  const FALLBACK: DocCategory = "legal-notice";
  if (!raw) return FALLBACK;

  if (raw in DOC_CATEGORIES) return raw as DocCategory;

  const hyphenated = raw.toLowerCase().replace(/_/g, "-");
  if (hyphenated in DOC_CATEGORIES) return hyphenated as DocCategory;

  return FALLBACK;
}

// Builds the pipeline steps shown at the top of the page for the current
// phase. Upload + OCR are always shown as already complete on this page
// (both happened on the previous /dashboard/documents screen before the
// user ever landed here) — this page only ever runs "AI Upload" (sending
// the extracted text to the AI provider) and "AI Analysis" (waiting for
// and receiving the structured result) itself.
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
      description:
        phase === "analyzing" ? "Running now…" : phase === "error" ? "Failed" : phase === "done" ? "Complete" : "Waiting…",
      status:
        phase === "loading-doc"
          ? "pending"
          : phase === "analyzing"
            ? "active"
            : phase === "error"
              ? "error"
              : "complete",
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

  // True only while a manual "Re-analyze" click is in flight, so the button
  // can show its own "Re-analyzing…" state distinct from the very first
  // automatic analysis run.
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // Countdown (seconds) while the AI provider's quota is exhausted. When
  // > 0, the Re-analyze button is disabled and shows a live countdown
  // instead of letting the user hammer a request that will just 429 again.
  const [quotaCooldown, setQuotaCooldown] = useState(0);

  useEffect(() => {
    if (quotaCooldown <= 0) return;
    const t = setTimeout(() => setQuotaCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [quotaCooldown]);

  // React Strict Mode (dev only) double-invokes effects. Without this guard,
  // a second overlapping run could fire its own GET /documents/:id (which
  // still shows analysis: null, since the first run's POST /analyze hasn't
  // saved yet) and overwrite the in-flight result with a stale null via
  // setDoc(docData) — silently erasing the analysis the first run was about
  // to receive. This ref ensures the load-and-analyze sequence only ever
  // actually runs once per document id, in dev and prod alike.
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

        // apiSuccess() wraps every response as { success: true, data: {...} } —
        // the real document payload is under `.data`, not top-level.
        const json = await res.json();
        const docData: DocumentRecord | undefined = json?.data;
        if (!docData) throw new Error("Couldn't load this document.");
        setDoc(docData);

        // Only auto-run analysis the very first time (analysisStatus is
        // PENDING, meaning it's never been attempted). A DEGRADED result
        // is a cached "Not detected" outcome from a prior attempt — it is
        // shown as-is, with a manual "Re-analyze" button, instead of
        // silently re-calling the AI provider (and burning quota) on
        // every page load.
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

  if (phase === "error" || (phase !== "loading-doc" && phase !== "analyzing" && !doc)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-red-500">{errorMsg || "Document not found."}</p>
      </div>
    );
  }

  if (phase === "loading-doc" || !doc) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-sky-100 bg-white px-6 py-5">
          <p className="text-sm text-sky-500">LegalSetu &rsaquo; Document OCR</p>
          <h1 className="text-2xl font-bold text-slate-900">Document OCR</h1>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          <OcrStepper steps={buildSteps("loading-doc")} />
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded bg-sky-100" />
            <div className="h-24 w-full rounded-xl bg-sky-50" />
          </div>
        </main>
      </div>
    );
  }

  const categoryKey = normalizeCategory(doc.category);
  const category = DOC_CATEGORIES[categoryKey];
  const isDegraded = doc.analysisStatus === "DEGRADED";

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-sky-100 bg-white px-6 py-5">
        <p className="text-sm text-sky-500">LegalSetu &rsaquo; Document OCR</p>
        <h1 className="text-2xl font-bold text-slate-900">Document OCR</h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <OcrStepper steps={buildSteps(phase)} />

        <Button variant="ghost" className="mb-4 text-sky-600" onClick={() => router.push("/dashboard/documents")}>
          ← Back
        </Button>

        <div className="mb-6 flex items-center gap-3">
          <span className="text-xl">{category.icon}</span>
          <div>
            <h2 className="font-semibold text-slate-900">{category.label}</h2>
            <p className="text-sm text-slate-500">{doc.fileName} · {doc.fileSizeKb} KB</p>
          </div>
        </div>

        <button
          className="mb-2 text-sm font-medium text-sky-600"
          onClick={() => setShowExtractedText((v) => !v)}
        >
          {showExtractedText ? "▾" : "▸"} Extracted Text (OCR)
        </button>
        {showExtractedText && (
          <Card className="mb-3 border-sky-100 bg-sky-50/50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {doc.ocrText}
          </Card>
        )}
        <p className="mb-6 text-sm text-slate-500">{doc.ocrConfidenceNote}</p>

        {doc.analysis ? (
          <Card className="border-sky-100 p-0 overflow-hidden">
            <div className={isDegraded ? "bg-amber-500 px-6 py-3" : "bg-sky-500 px-6 py-3"}>
              <h3 className="font-semibold text-white">
                {isDegraded ? "AI Summary — Not Available" : "AI Summary"}
              </h3>
            </div>
            <div className="space-y-5 px-6 py-6">
              {isDegraded && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  The AI couldn't analyze this document last time. You can try again below — this
                  won't re-run automatically on future visits, to save on AI usage.
                </p>
              )}

              <Field label="Case Name" value={doc.analysis.caseName} />
              <Field label="Judge" value={doc.analysis.judge} />
              <Field label="Date" value={doc.analysis.date} />
              <Field label="Decision Summary" value={doc.analysis.decisionSummary} />
              <Field label="Key Findings" items={doc.analysis.keyFindings} />
              <Field label="Next Steps" items={doc.analysis.nextSteps} />

              <Disclaimer />

              <div className="flex flex-wrap gap-3">
                {isDegraded && (
                  <Button
                    className="bg-sky-500 text-white hover:bg-sky-600"
                    onClick={handleReanalyze}
                    disabled={isReanalyzing || quotaCooldown > 0}
                  >
                    {isReanalyzing
                      ? "Re-analyzing…"
                      : quotaCooldown > 0
                        ? `Try again in ${quotaCooldown}s`
                        : "Re-analyze"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-sky-300 text-sky-700"
                  onClick={() => router.push("/dashboard/documents")}
                >
                  Analyze Another {category.label}
                </Button>
              </div>

              {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            </div>
          </Card>
        ) : (
          <Card className="border-sky-100 bg-sky-50/40 p-6 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
            <p className="font-medium text-sky-700">Generating AI summary…</p>
            <p className="mt-1 text-sm text-slate-500">This usually takes a few seconds.</p>
          </Card>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, items }: { label: string; value?: string; items?: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-600">{label}</p>
      {value !== undefined && <p className="text-sm text-slate-800">{value}</p>}
      {items !== undefined && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}