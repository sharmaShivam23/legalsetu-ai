// app/api/documents/ocr-fallback/route.ts
//
// Called by lib/ocr/ocr.ts ONLY when Tesseract's confidence on a page is
// too low. Uses the AI provider's existing `ocr()` method — already part
// of your AIProvider interface, so no changes needed to lib/ai/provider.ts,
// lib/ai/gemini.ts, or lib/ai/mock.ts. Single attempt, hard timeout, no
// retries — if it fails, the client keeps Tesseract's original text.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getAIProvider } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";
export const maxDuration = 20;

const GEMINI_TIMEOUT_MS = 12_000;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // matches sanitize.ts's MAX_FILE_SIZE_BYTES

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ocr_fallback_timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const rl = await checkRateLimit(session.user.id, "aiGeneration");
  if (!rl.success) {
    return apiError("rate_limited", "Too many OCR requests. Please try again later.", 429);
  }

  try {
    const formData = await req.formData();
    const image = formData.get("image");
    if (!(image instanceof Blob)) {
      return apiError("no_image", "No image was provided.", 400);
    }
    if (image.size > MAX_IMAGE_SIZE) {
      return apiError("image_too_large", "Image exceeds the size limit.", 413);
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const mimeType = image.type || "image/png";

    const provider = await getAIProvider();

    // provider.ocr() already exists on the AIProvider interface — the
    // MockProvider should return canned demo text here, GeminiProvider
    // does real vision OCR, matching the rest of the app's demo-mode
    // guarantee with zero extra plumbing needed.
    const { text, confidence } = await withTimeout(
      provider.ocr(buffer, mimeType),
      GEMINI_TIMEOUT_MS
    );

    if (!text || !text.trim()) {
      return apiError("empty_result", "No text could be extracted.", 200);
    }

    return apiSuccess({ text: text.trim(), confidence: confidence ?? 60 });
  } catch (err) {
    // Timeout, provider error, missing key — all return a clean failure.
    // The client-side OCR pipeline treats any non-2xx or empty text as
    // "fallback didn't help" and keeps Tesseract's result, no retry.
    return apiError(
      "ocr_fallback_failed",
      err instanceof Error ? err.message : "OCR fallback failed.",
      502
    );
  }
}