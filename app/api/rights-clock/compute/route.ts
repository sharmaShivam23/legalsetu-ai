// ==========================================================
// POST /api/rights-clock/compute — live calculation, nothing saved
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { engineInputSchema } from "@/lib/rights-clock/schema";
import { runRightsClock } from "@/lib/rights-clock";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rl = await checkRateLimit(userId, "apiDefault");
  if (!rl.success) return apiError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);

  const body = await req.json().catch(() => null);
  const parsed = engineInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid details.", 422);
  }

  return apiSuccess({ result: runRightsClock(parsed.data) });
}
