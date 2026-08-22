// app/dashboard/documents/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/common/disclaimer";
import { DOC_CATEGORIES, type DocCategory } from "@/app/dashboard/documents/page";

interface AnalysisResult {
  documentType: string;
  partiesInvolved: string[];
  keyDates: string[];
  mainSubjectMatter: string;
  obligationsOrDirections: string[];
  deadlinesOrTimeLimits: string[];
  possibleConsequences: string[];
  recommendedNextSteps: string[];
}

interface DocumentRecord {
  id: string;
  fileName: string;
  fileSizeKb: number;
  category: string; // widened — server value isn't guaranteed to already match DocCategory
  ocrText: string;
  ocrConfidenceNote: string;
  analysis: AnalysisResult | null;
}

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

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/documents/${id}`);
        if (!res.ok) throw new Error("Couldn't load this document.");
        const data = await res.json();
        setDoc(data);

        // Trigger analysis if it hasn't run yet.
        if (!data.analysis) {
          const analyzeRes = await fetch(`/api/documents/${id}/analyze`, { method: "POST" });
          const analyzeData = await analyzeRes.json();
          setDoc((prev) => (prev ? { ...prev, analysis: analyzeData.result } : prev));
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sky-500">Analyzing your document…</p>
      </div>
    );
  }

  if (errorMsg || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-red-500">{errorMsg || "Document not found."}</p>
      </div>
    );
  }

  const categoryKey = normalizeCategory(doc.category);
  const category = DOC_CATEGORIES[categoryKey];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-sky-100 bg-white px-6 py-5">
        <p className="text-sm text-sky-500">LegalSetu &rsaquo; Document OCR</p>
        <h1 className="text-2xl font-bold text-slate-900">Document OCR</h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
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
            <div className="bg-sky-500 px-6 py-3">
              <h3 className="font-semibold text-white">AI Summary</h3>
            </div>
            <div className="space-y-5 px-6 py-6">
              <Field label="Document Type" value={doc.analysis.documentType} />
              <Field label="Parties Involved" items={doc.analysis.partiesInvolved} />
              <Field label="Key Dates" items={doc.analysis.keyDates} />
              <Field label="Main Subject Matter" value={doc.analysis.mainSubjectMatter} />
              <Field label="Obligations / Directions" items={doc.analysis.obligationsOrDirections} />
              <Field label="Deadlines / Time Limits" items={doc.analysis.deadlinesOrTimeLimits} />
              <Field label="Possible Consequences" items={doc.analysis.possibleConsequences} />
              <Field label="Recommended Next Steps" items={doc.analysis.recommendedNextSteps} />

              <Disclaimer />

              <Button
                variant="outline"
                className="border-sky-300 text-sky-700"
                onClick={() => router.push("/dashboard/documents")}
              >
                Analyze Another {category.label}
              </Button>
            </div>
          </Card>
        ) : (
          <p className="text-sky-500">Generating AI summary…</p>
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