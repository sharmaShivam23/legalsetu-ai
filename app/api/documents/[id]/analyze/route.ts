// app/api/documents/[id]/analyze/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  analysisResultSchema,
  fallbackAnalysisResult,
} from "@/lib/validation/schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANALYZE_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT =
  "You are a legal-document analysis assistant for LegalSetu, helping non-lawyers " +
  "in India understand documents. You provide legal information, not legal advice. " +
  "Base every answer strictly on the extracted text you are given — never invent facts. " +
  "Return ONLY valid JSON, with no markdown formatting and no commentary.";

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

function buildUserPrompt(ocrText: string): string {
  return `Analyze this scanned/OCR'd Legal document.
Respond in simple English that a non-lawyer can understand.
If a field cannot be determined from the text, use exactly "Not detected" (or an array containing only that string for list fields).

Extract exactly these fields:
- Case Name: the name/title of the case or matter.
- Judge: the presiding judge, magistrate, or issuing officer's name and title.
- Date: the primary date on the document.
- Decision Summary: a concise (2-4 sentence) plain-English summary.
- Key Findings: the main factual or legal findings, as a list.
- Next Steps: what the reader should do next procedurally, as a list.

Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "caseName": "string",
  "judge": "string",
  "date": "string",
  "decisionSummary": "string",
  "keyFindings": ["string"],
  "nextSteps": ["string"]
}

--- EXTRACTED TEXT (OCR) ---
${ocrText.slice(0, 12000)}
--- END EXTRACTED TEXT ---`;
}

function isQuotaError(err: unknown): { quota: true; retryDelaySeconds: number | null } | { quota: false } {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as any)?.status ?? (err as any)?.code;

  const looksLikeQuota =
    status === 429 ||
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /rate.?limit/i.test(message) ||
    /quota/i.test(message);

  if (!looksLikeQuota) return { quota: false };

  const match = message.match(/retryDelay["']?\s*[:=]\s*["']?(\d+)s/i);
  const retryDelaySeconds = match ? parseInt(match[1], 10) : null;

  return { quota: true, retryDelaySeconds };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const rl = await checkRateLimit(session.user.id, "aiGeneration");
  if (!rl.success) {
    return apiError("rate_limited", "Too many analysis requests. Please try again later.", 429);
  }

  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  // FIXED: Changed to prisma.document
  const doc = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
  });
  
  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  if (doc.status === "READY" && doc.summary && !force) {
    try {
      return apiSuccess({ result: JSON.parse(doc.summary), degraded: false });
    } catch(e) {
      // If parsing fails, fall through and re-analyze
    }
  }

  try {
    const provider = await getAIProvider();

    const rawText = await withTimeout(
      provider.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(doc.extractedText || "") }, // FIXED: uses extractedText
        ],
        temperature: 0.2,
      }),
      ANALYZE_TIMEOUT_MS,
      "analysis_timeout"
    );

    const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
    const jsonCandidate = JSON.parse(cleaned);
    const analysis = analysisResultSchema.parse(jsonCandidate);

    // FIXED: Uses your DocumentStatus enums (READY) and stores JSON in summary
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: "READY", summary: JSON.stringify(analysis) },
    });

    return apiSuccess({ result: analysis, degraded: false });
  } catch (err) {
    const quotaCheck = isQuotaError(err);

    if (quotaCheck.quota) {
      return NextResponse.json(
        {
          success: false,
          error: "quota_exceeded",
          message: "The AI analysis service has hit its usage limit for now. Please try again in a bit.",
          retryDelaySeconds: quotaCheck.retryDelaySeconds,
          errorDetail: err instanceof Error ? err.message : "unknown_error",
        },
        { status: 429 }
      );
    }

    const fallback = fallbackAnalysisResult();

    // FIXED: Uses your DocumentStatus enums (FAILED) and stores fallback in summary
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: "FAILED", summary: JSON.stringify(fallback) },
    });

    return apiSuccess({
      result: fallback,
      degraded: true,
      errorDetail: err instanceof Error ? err.message : "unknown_error",
    });
  }
}