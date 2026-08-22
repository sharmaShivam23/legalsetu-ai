// app/dashboard/documents/page.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disclaimer } from "@/components/common/disclaimer";
import { runLegalDocumentOCR } from "@/lib/ocr/ocr";

type Screen = "select" | "upload" | "staged";

export const DOC_CATEGORIES = {
  "legal-notice": {
    label: "Legal Notice",
    description: "Upload a legal notice (sent or received) to understand its content and required response.",
    icon: "📩",
  },
  "fir-police-doc": {
    label: "FIR / Police Document",
    description: "Upload an FIR, police report, or complaint copy to identify key details and next steps.",
    icon: "🛡️",
  },
  "court-order": {
    label: "Court Order",
    description: "Upload a court order or judgment to understand what it directs and any deadlines.",
    icon: "⚖️",
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
      // Step 1: OCR client-side (Tesseract-first, Gemini-fallback).
      const ocr = await runLegalDocumentOCR([file]);

      // Step 2: create the document record + kick off analysis, sending
      // only the OCR text — never the raw image — to the analyze route.
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

      // apiSuccess() wraps every response as { success: true, data: {...} } —
      // the real payload is under `.data`, not top-level.
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
    <div className="min-h-screen bg-white">
      <header className="border-b border-sky-100 bg-white px-6 py-5">
        <p className="text-sm text-sky-500">LegalSetu &rsaquo; Document OCR</p>
        <h1 className="text-2xl font-bold text-slate-900">Document OCR</h1>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {screen === "select" && (
          <>
            <Card className="mb-8 border-sky-100 bg-sky-50">
              <div className="flex items-center gap-3 px-6 py-4">
                <span className="text-lg">📄</span>
                <h2 className="font-semibold text-slate-900">Document OCR</h2>
                <Badge className="ml-auto bg-sky-500 text-white">OCR + AI ANALYSIS</Badge>
              </div>
              <p className="px-6 pb-5 text-sm text-slate-600">
                Upload a photo or scan of a legal notice, FIR/police document, or court order.
                Text is read on-device first — only that text, never the image, is sent to AI
                for a short, structured summary.
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {CATEGORY_ORDER.map((cat) => (
                <Card
                  key={cat}
                  className="cursor-pointer border-sky-100 p-6 text-center transition hover:border-sky-300 hover:shadow-md"
                  onClick={() => selectCategory(cat)}
                >
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-2xl">
                    {DOC_CATEGORIES[cat].icon}
                  </div>
                  <h3 className="mb-2 font-semibold text-slate-900">{DOC_CATEGORIES[cat].label}</h3>
                  <p className="mb-4 text-sm text-slate-500">{DOC_CATEGORIES[cat].description}</p>
                  <Button className="w-full bg-sky-500 text-white hover:bg-sky-600">
                    Upload {DOC_CATEGORIES[cat].label}
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {screen === "upload" && category && (
          <>
            <Button variant="ghost" className="mb-4 text-sky-600" onClick={goBack}>
              ← Back
            </Button>
            <div className="mb-6 flex items-center gap-3">
              <span className="text-xl">{DOC_CATEGORIES[category].icon}</span>
              <div>
                <h2 className="font-semibold text-slate-900">{DOC_CATEGORIES[category].label}</h2>
                <p className="text-sm text-slate-500">{DOC_CATEGORIES[category].description}</p>
              </div>
            </div>

            <Card
              className="border-2 border-dashed border-sky-200 bg-sky-50/50 px-6 py-16 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileChosen(f);
              }}
            >
              <p className="mb-1 font-semibold text-slate-900">
                Upload {DOC_CATEGORIES[category].label}
              </p>
              <p className="mb-6 text-sm text-slate-500">
                Drag a photo or PDF here, or choose an option below · JPG, PNG, or PDF
              </p>
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
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  className="border-sky-300 text-sky-700"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Document
                </Button>
                <Button className="bg-sky-500 text-white hover:bg-sky-600" onClick={() => fileInputRef.current?.click()}>
                  Take Photo
                </Button>
              </div>
            </Card>
          </>
        )}

        {screen === "staged" && file && category && (
          <>
            <Button variant="ghost" className="mb-4 text-sky-600" onClick={goBack}>
              ← Back
            </Button>
            <div className="mb-6">
              <h2 className="font-semibold text-slate-900">{DOC_CATEGORIES[category].label}</h2>
              <p className="text-sm text-slate-500">{DOC_CATEGORIES[category].description}</p>
            </div>

            <Card className="border-sky-100 bg-sky-50/50 p-6 text-center">
              <p className="font-semibold text-slate-900">{file.name}</p>
              <p className="mb-5 text-sm text-slate-500">{(file.size / 1024).toFixed(0)} KB</p>
              <div className="flex justify-center gap-3">
                <Button
                  className="bg-sky-500 text-white hover:bg-sky-600"
                  onClick={runAnalysis}
                  disabled={isUploading}
                >
                  {isUploading ? "Analyzing…" : "Run Analysis"}
                </Button>
                <Button
                  variant="outline"
                  className="border-sky-300 text-sky-700"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Choose Different Image
                </Button>
              </div>
              {errorMsg && <p className="mt-4 text-sm text-red-500">{errorMsg}</p>}
            </Card>
          </>
        )}

        <div className="mt-8">
          <Disclaimer />
        </div>
      </main>
    </div>
  );
}