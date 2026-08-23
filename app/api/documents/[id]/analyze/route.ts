// app/api/documents/[id]/analyze/route.ts
//
// Runs the structured legal-analysis prompt against the document's stored
// ocrText (never the image). Uses only lib/ai/provider.ts's `complete()`
// method — never a vendor SDK directly — so demo mode (MockProvider) and
// provider swaps (Gemini/OpenAI) work with zero changes here.

import { NextRequest, NextResponse } from "next/server";
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

function buildUserPrompt(categoryLabel: string, ocrText: string): string {
  return `Analyze this scanned/OCR'd "${categoryLabel}" document.
Respond in simple English that a non-lawyer can understand.
If a field cannot be determined from the text, use exactly "Not detected" (or an array containing only that string for list fields).

Extract exactly these fields:
- Case Name: the name/title of the case or matter (e.g. "Nexus Data Solutions, LLC v. Visionary OCR Corp"). For documents without a formal case name (e.g. a legal notice), use the closest equivalent (sender/recipient, or subject line).
- Judge: the presiding judge, magistrate, or issuing officer's name and title. For documents with no judge (e.g. a legal notice), use "Not applicable".
- Date: the primary date on the document (filing date, order date, notice date).
- Decision Summary: a concise (2-4 sentence) plain-English summary of what was decided, ordered, or communicated.
- Key Findings: the main factual or legal findings, as a list.
- Next Steps: what the reader should do next, or what happens next procedurally, as a list.

Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "caseName": string,
  "judge": string,
  "date": string,
  "decisionSummary": string,
  "keyFindings": string[],
  "nextSteps": string[]
}

--- EXTRACTED TEXT (OCR) ---
${ocrText.slice(0, 12000)}
--- END EXTRACTED TEXT ---`;
}

// Detects a quota/rate-limit failure from the upstream provider, regardless
// of which provider is active. Google's SDK errors carry either a numeric
// `.status`/`.code` of 429, or the string "RESOURCE_EXHAUSTED" somewhere in
// the message; OpenAI's SDK throws a `.status === 429` too, so checking
// both the message text and any status/code property covers both without
// importing either vendor SDK's error types directly.
function isQuotaError(err: unknown): { quota: true; retryDelaySeconds: number | null } | { quota: false } {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as any)?.status ?? (err as any)?.code;

  const looksLikeQuota =
    status === 429 ||
    /RESOURCE_EXHAUSTED/i.test(message) ||
    /rate.?limit/i.test(message) ||
    /quota/i.test(message);

  if (!looksLikeQuota) return { quota: false };

  // Try to pull a retryDelay out of the raw error message/body, e.g.
  // Google's error includes `"retryDelay":"37s"` in its JSON payload.
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

  // Explicit opt-in for re-running an already-attempted analysis, e.g. a
  // "Re-analyze" button in the UI (`POST /analyze?force=1`). Without this,
  // a DEGRADED result is treated as cached/final — the client never
  // silently re-triggers a paid AI call just by loading the page again.
  const force = req.nextUrl.searchParams.get("force") === "1";

  const doc = await prisma.legalDocument.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  // Idempotent — if analysis already completed, just return it, unless the
  // caller explicitly asked to force a re-run.
  if (doc.analysisStatus === "COMPLETE" && doc.analysisJson && !force) {
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

    // Providers that support a native JSON response mode (see
    // GeminiProvider.complete()) already return clean JSON with no
    // fences. This strip is a defensive fallback for providers/models
    // that still wrap output in ```json ... ``` despite instructions.
    const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
    const jsonCandidate = JSON.parse(cleaned);
    const analysis = analysisResultSchema.parse(jsonCandidate);

    await prisma.legalDocument.update({
      where: { id: doc.id },
      data: { analysisStatus: "COMPLETE", analysisJson: analysis },
    });

    return apiSuccess({ result: analysis, degraded: false });
  } catch (err) {
    const quotaCheck = isQuotaError(err);

    // Quota/rate-limit failures are NOT written to the document as a
    // DEGRADED "Not detected" result — the AI never actually got a chance
    // to look at the text, so caching a wrong "not found" answer would be
    // misleading. The document's analysisStatus stays whatever it was
    // (PENDING, so the next real attempt is treated as the first one).
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

    // Any other model error, timeout, bad JSON, schema mismatch — degrade
    // gracefully to "Not detected" fields instead of failing the request.
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