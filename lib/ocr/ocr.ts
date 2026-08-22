// lib/ocr/legal-ocr.ts
//
// LegalSetu — Legal Document OCR (Hybrid: Tesseract-first, Gemini-fallback)
// ──────────────────────────────────────────────────────────────────────────
// Structure mirrors Healio+/Asha+ Care's Medical Analysis OCR:
//   - Tesseract.js does the real work first (fast, free, on-device, handles
//     standard printed EN/HI text well without any API call).
//   - Gemini is ONLY invoked as a fallback, and ONLY server-side (via
//     /api/legal-analysis/ocr-fallback) — never from the browser directly,
//     so the API key never ships to the client.
//   - The fallback call is wrapped in a hard timeout + single attempt.
//     If Gemini is slow, down, or errors, we fall back to whatever
//     Tesseract already extracted instead of hanging or retrying forever.
//   - Only extracted TEXT is ever sent over the network for the fallback —
//     same "text, never treated as permanent image storage" spirit as the
//     medical flow, though the fallback path does need to send the image
//     itself to Gemini's vision model since Tesseract couldn't read it.
//
// Public API:
//   runLegalDocumentOCR(files: File[], opts?) => Promise<LegalOcrResult>
// ──────────────────────────────────────────────────────────────────────────

export type DocLang = "en" | "hi" | "hinglish" | "unknown";
export type OcrEngine = "tesseract" | "gemini-fallback" | "none";

export interface OcrPageResult {
  pageNumber: number;
  rawText: string;
  confidence: number; // 0-100
  engine: OcrEngine;
}

export interface OcrLine {
  text: string;
  lang: DocLang;
}

export interface LegalOcrResult {
  rawText: string;
  pages: OcrPageResult[];
  lines: OcrLine[];
  detectedLangs: DocLang[];
  overallConfidence: number;
  confidenceNote: string;
  usedFallback: boolean; // true if Gemini had to step in for any page
}

export interface OcrOptions {
  /** Below this Tesseract confidence, try the Gemini fallback for that page. Default 45. */
  fallbackConfidenceThreshold?: number;
  /** Hard ceiling on the fallback network call. Default 15000ms. */
  fallbackTimeoutMs?: number;
}

const DEFAULT_FALLBACK_THRESHOLD = 45;
const DEFAULT_FALLBACK_TIMEOUT_MS = 15_000;

export const MAX_OCR_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const MIN_DIM = 1200;
const MAX_DIM = 2600;

// ─── Tesseract loader (CDN, singleton) ─────────────────────────────────────

const TESSERACT_CDN = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0",
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
};
const TESSERACT_LANGS = "hin+eng";

declare global {
  interface Window {
    Tesseract?: any;
  }
}

let tesseractLoadPromise: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if (typeof window !== "undefined" && window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }
  if (!tesseractLoadPromise) {
    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        // Reset so a later retry (e.g. after the network recovers) doesn't
        // stay stuck on this same rejected promise forever.
        tesseractLoadPromise = null;
        reject(new Error("Couldn't load the OCR engine. Check your internet connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return tesseractLoadPromise;
}

// ─── PDF loader (CDN, singleton) ───────────────────────────────────────────
//
// NOTE: cdnjs.cloudflare.com stopped hosting pdf.js's classic UMD build
// (pdf.min.js) as of pdf.js v5+ — it now only ships ES module (.mjs)
// builds there. jsdelivr still serves the legacy UMD build via the
// pdfjs-dist npm package's /legacy/build/ path, which is what we use here.
// This also means pdf.js now shares the same CDN (jsdelivr) as Tesseract,
// so no extra CSP domain is needed beyond what's already allowed.

const PDFJS_VERSION = "4.0.379";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build`;

let pdfjsLoadPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (!pdfjsLoadPromise) {
    pdfjsLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${PDFJS_BASE}/pdf.min.js`;
      script.async = true;
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
        resolve(lib);
      };
      script.onerror = () => {
        // Reset so a later retry (e.g. after the network recovers) doesn't
        // stay stuck on this same rejected promise forever.
        pdfjsLoadPromise = null;
        reject(new Error("Couldn't load the PDF engine. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return pdfjsLoadPromise;
}

async function pdfToPageBlobs(file: File): Promise<Blob[]> {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const blobs: Blob[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/png")
    );
    blobs.push(blob);
  }
  return blobs;
}

// ─── Image preprocessing (EXIF fix + resize + contrast stretch) ───────────

async function preprocessImageForOCR(file: File | Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file instanceof Blob ? file : new Blob([file]);
    }
  }

  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  let scale = 1;
  if (longest < MIN_DIM) scale = MIN_DIM / longest;
  else if (longest > MAX_DIM) scale = MAX_DIM / longest;
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const px = imgData.data;
    let min = 255,
      max = 0;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      gray[j] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(max - min, 1);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const stretched = ((gray[j] - min) / range) * 255;
      px[i] = px[i + 1] = px[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // tainted canvas — fall back to oriented/resized image, don't lose the attempt
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || (file instanceof Blob ? file : new Blob([file]))), "image/png");
  });
}

// ─── Gemini fallback — server route only, hard timeout, single attempt ────
// This NEVER retries and NEVER loops. One shot, one timeout. If it fails
// or times out for any reason, we just keep whatever Tesseract produced
// (even if that's empty) and move on — the page is marked "none"/low
// confidence rather than the whole pipeline hanging.

async function tryGeminiFallback(
  imageBlob: Blob,
  timeoutMs: number
): Promise<{ text: string; confidence: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    formData.append("image", imageBlob, "page.png");

    const res = await fetch("/api/legal-analysis/ocr-fallback", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (typeof data?.text !== "string" || !data.text.trim()) return null;

    return {
      text: data.text.trim(),
      confidence: typeof data?.confidence === "number" ? data.confidence : 60,
    };
  } catch {
    // Covers: abort (timeout), network failure, bad JSON — all treated the
    // same way: fallback simply didn't help, don't throw, don't retry.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Language tagging (heuristic, no AI call) ──────────────────────────────

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HINGLISH_HINTS = new Set([
  "hai", "hain", "nahi", "nahin", "kya", "kaise", "karein", "kripya",
  "dhara", "vidhan", "adalat", "kanoon", "samjhauta", "kiraya", "makan",
  "shart", "shulk", "anubandh", "pratibaddh", "vakil", "gawah", "fir",
]);

function tagLine(line: string): DocLang {
  const trimmed = line.trim();
  if (!trimmed) return "unknown";
  if (DEVANAGARI_RE.test(trimmed)) return "hi";

  const words = trimmed.toLowerCase().split(/\s+/);
  const hinglishHits = words.filter((w) => HINGLISH_HINTS.has(w.replace(/[^a-z]/g, ""))).length;
  if (hinglishHits >= 1 && hinglishHits / words.length > 0.05) return "hinglish";

  if (/[a-zA-Z]/.test(trimmed)) return "en";
  return "unknown";
}

function tagAllLines(rawText: string): OcrLine[] {
  return rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text, lang: tagLine(text) }));
}

// ─── Postprocess: merge pages, strip repeated headers/footers ─────────────

function stripRepeatedHeadersFooters(pages: string[]): string[] {
  if (pages.length < 3) return pages;

  const firstLines = pages.map((p) => p.split("\n")[0]?.trim() || "");
  const lastLines = pages.map((p) => {
    const lines = p.split("\n").filter(Boolean);
    return lines[lines.length - 1]?.trim() || "";
  });

  const isRepeated = (arr: string[], value: string) =>
    value.length > 3 && arr.filter((v) => v === value).length >= Math.ceil(pages.length * 0.6);

  return pages.map((page, i) => {
    let lines = page.split("\n");
    if (isRepeated(firstLines, firstLines[i])) lines = lines.slice(1);
    if (isRepeated(lastLines, lastLines[i])) lines = lines.slice(0, -1);
    return lines.join("\n").trim();
  });
}

function mergeAndDedupe(pages: string[]): string {
  const cleaned = stripRepeatedHeadersFooters(pages);
  return cleaned
    .map((p, i) => `\n--- Page ${i + 1} ---\n${p}`)
    .join("\n")
    .trim();
}

// ─── Confidence note ────────────────────────────────────────────────────

function buildConfidenceNote(overallConfidence: number, hadAnyText: boolean, usedFallback: boolean): string {
  if (!hadAnyText) {
    return "No readable text was extracted, even after a backup AI-assisted attempt. The scan may be too blurry, too small, or handwritten in a way that isn't machine-readable.";
  }
  if (usedFallback && overallConfidence < 60) {
    return "Standard OCR struggled with parts of this document; an AI-assisted backup filled in the gaps, but please review the extracted text carefully before analysis.";
  }
  if (overallConfidence < 55) {
    return "OCR confidence is low — this document may have handwriting, stamps, or poor scan quality. Please review the extracted text carefully before analysis.";
  }
  if (overallConfidence < 75) {
    return "OCR confidence is moderate. Some words or numbers may be misread — please verify extracted text before proceeding.";
  }
  return "OCR confidence is good.";
}

// ─── Main entry point ───────────────────────────────────────────────────

export async function runLegalDocumentOCR(
  files: File[],
  opts: OcrOptions = {}
): Promise<LegalOcrResult> {
  const fallbackThreshold = opts.fallbackConfidenceThreshold ?? DEFAULT_FALLBACK_THRESHOLD;
  const fallbackTimeoutMs = opts.fallbackTimeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS;

  if (!files.length) {
    throw new Error("No files provided for OCR.");
  }

  for (const f of files) {
    if (f.size > MAX_OCR_FILE_SIZE) {
      throw new Error(`"${f.name}" is larger than 15 MB. Please upload a smaller file.`);
    }
    const isPdf = f.type === "application/pdf";
    const isImage = f.type.startsWith("image/");
    if (!isPdf && !isImage) {
      throw new Error(`"${f.name}" is not a supported file type. Upload a PDF, JPG, or PNG.`);
    }
  }

  // Flatten every uploaded file into page-image blobs.
  const pageBlobs: Blob[] = [];
  for (const file of files) {
    if (file.type === "application/pdf") {
      const pages = await pdfToPageBlobs(file);
      pageBlobs.push(...pages);
    } else {
      pageBlobs.push(file);
    }
  }

  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker(TESSERACT_LANGS, 1, { ...TESSERACT_CDN });

  const pages: OcrPageResult[] = [];
  let usedFallback = false;

  try {
    for (let i = 0; i < pageBlobs.length; i++) {
      const processed = await preprocessImageForOCR(pageBlobs[i]);

      // Step 1 — Tesseract always tries first. It's fast, free, and handles
      // standard printed EN/HI text well without any network call.
      const { data } = await worker.recognize(processed);
      let text = (data?.text || "").trim();
      let confidence = typeof data?.confidence === "number" ? data.confidence : 0;
      let engine: OcrEngine = text ? "tesseract" : "none";

      // Step 2 — Gemini fallback ONLY if Tesseract's result is weak. One
      // attempt, hard timeout, never blocks the pipeline if it fails.
      const needsFallback = !text || confidence < fallbackThreshold;
      if (needsFallback) {
        const fallback = await tryGeminiFallback(processed, fallbackTimeoutMs);
        if (fallback && fallback.text.length > text.length) {
          text = fallback.text;
          confidence = fallback.confidence;
          engine = "gemini-fallback";
          usedFallback = true;
        }
        // If fallback returns null/worse, we simply keep Tesseract's
        // original (possibly empty) result — no retry, no throw.
      }

      pages.push({ pageNumber: i + 1, rawText: text, confidence, engine });
    }
  } finally {
    await worker.terminate();
  }

  const mergedRawText = mergeAndDedupe(pages.map((p) => p.rawText));
  const lines = tagAllLines(mergedRawText);
  const detectedLangs = Array.from(new Set(lines.map((l) => l.lang))).filter(
    (l) => l !== "unknown"
  ) as DocLang[];

  const confidences = pages.map((p) => p.confidence).filter((c) => c > 0);
  const overallConfidence =
    confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;

  const hadAnyText = pages.some((p) => p.rawText.length > 0);
  if (!hadAnyText) {
    throw new Error(
      "Couldn't read any text from this document, even with the AI-assisted backup. Try a clearer scan or a higher-resolution photo."
    );
  }

  return {
    rawText: mergedRawText,
    pages,
    lines,
    detectedLangs: detectedLangs.length ? detectedLangs : ["unknown"],
    overallConfidence,
    confidenceNote: buildConfidenceNote(overallConfidence, hadAnyText, usedFallback),
    usedFallback,
  };
}