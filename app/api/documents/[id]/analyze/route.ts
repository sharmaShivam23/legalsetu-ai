// app/api/documents/[id]/analyze/route.ts
//
// Runs the structured legal-analysis prompt against the document's stored
// ocrText (never the image). Uses only lib/ai/provider.ts's `complete()`
// method — never a vendor SDK directly — so demo mode (MockProvider) and
// provider swaps (Gemini/OpenAI) work with zero changes here.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  analysisResultSchema,
  fallbackAnalysisResult,
  DOCUMENT_CATEGORY_FROM_DB,
} from "@/lib/validation/schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANALYZE_TIMEOUT_MS = 20_000;

const CATEGORY_LABELS: Record<string, string> = {
  "legal-notice": "Legal Notice",
  "fir-police-doc": "FIR / Police Document",
  "court-order": "Court Order",
};

const SYSTEM_PROMPT =
  "You are a legal-document analysis assistant for LegalSetu, helping non-lawyers " +
  "in India understand documents. You provide legal information, not legal advice. " +
  "Base every answer strictly on the extracted text you are given — never invent facts.";

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutError)), ms);
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

function buildUserPrompt(categoryLabel: string, ocrText: string): string {
  return `Analyze this scanned/OCR'd "${categoryLabel}" document.
Respond in simple English that a non-lawyer can understand.
If a field cannot be determined from the text, use exactly "Not detected" (or an array containing only that string for list fields).

Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "documentType": string,
  "partiesInvolved": string[],
  "keyDates": string[],
  "mainSubjectMatter": string,
  "obligationsOrDirections": string[],
  "deadlinesOrTimeLimits": string[],
  "possibleConsequences": string[],
  "recommendedNextSteps": string[]
}

--- EXTRACTED TEXT (OCR) ---
${ocrText.slice(0, 12000)}
--- END EXTRACTED TEXT ---`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const rl = await checkRateLimit(session.user.id, "aiGeneration");
  if (!rl.success) {
    return apiError("rate_limited", "Too many analysis requests. Please try again later.", 429);
  }

  const doc = await prisma.legalDocument.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  // Idempotent — if analysis already completed, just return it.
  if (doc.analysisStatus === "COMPLETE" && doc.analysisJson) {
    return apiSuccess({ result: doc.analysisJson, degraded: false });
  }

  const categoryLabel = CATEGORY_LABELS[DOCUMENT_CATEGORY_FROM_DB[doc.category]];

  try {
    const provider = await getAIProvider(); // async — resolves to Mock/Gemini/OpenAI

    const rawText = await withTimeout(
      provider.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(categoryLabel, doc.ocrText) },
        ],
        temperature: 0.2,
      }),
      ANALYZE_TIMEOUT_MS,
      "analysis_timeout"
    );

    const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
    const jsonCandidate = JSON.parse(cleaned);
    const analysis = analysisResultSchema.parse(jsonCandidate);

    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: { analysisStatus: "COMPLETE", analysisJson: analysis },
    });

    return apiSuccess({ result: analysis, degraded: false });
  } catch (err) {
    // Model error, timeout, bad JSON, schema mismatch — degrade gracefully
    // to "Not detected" fields instead of failing the whole request.
    const fallback = fallbackAnalysisResult();

    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: { analysisStatus: "DEGRADED", analysisJson: fallback },
    });

    return apiSuccess({
      result: fallback,
      degraded: true,
      errorDetail: err instanceof Error ? err.message : "unknown_error",
    });
  }
}