// ==========================================================
// LegalSetu — which AI models are working right now
// ----------------------------------------------------------
// GET /api/ai/status            cached (2 min) live probe of every key
// GET /api/ai/status?refresh=1  force a fresh probe
//
// Adds the signed-in user's own daily allowance per model, so the
// model picker can show both limits: the provider's and LegalSetu's.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getAIStatus } from "@/lib/ai/status";
import { checkUsage } from "@/lib/ai/usage";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "apiDefault");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  try {
    const report = await getAIStatus(req.nextUrl.searchParams.get("refresh") === "1");
    const models = await Promise.all(
      report.models.map(async (m) => {
        const usage = await checkUsage(userId, m.provider, m.id);
        return { ...m, userRemaining: usage.remaining, userLimit: usage.limit };
      })
    );
    return apiSuccess({ ...report, models });
  } catch (err) {
    logger.error("AI status check failed", { errorType: String(err).slice(0, 200) });
    return apiError("STATUS_FAILED", "Could not check the AI providers right now.", 500);
  }
}
