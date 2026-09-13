// ==========================================================
// LegalSetu — confirm a signup with the emailed code
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { verifyOtp, otpFailureMessage } from "@/lib/otp/otp";

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "otpVerify");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Please enter the code exactly as emailed.", 422);
  }

  const result = await verifyOtp(parsed.data.email, "EMAIL_VERIFICATION", parsed.data.code);
  if (!result.ok) {
    return apiError("OTP_INVALID", otpFailureMessage(result.reason), 422);
  }

  try {
    const user = await prisma.user.update({
      where: { email: parsed.data.email.toLowerCase().trim() },
      data: { emailVerified: new Date() },
      select: { id: true, email: true, name: true },
    });

    logger.info("Email verified", { userId: user.id });
    return apiSuccess({ verified: true, email: user.email });
  } catch (err) {
    logger.error("Email verification update failed", { errorType: String(err).slice(0, 200) });
    return apiError("VERIFY_FAILED", "Could not verify your account right now. Please try again.", 500);
  }
}
