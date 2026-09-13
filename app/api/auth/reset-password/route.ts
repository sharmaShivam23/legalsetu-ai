// ==========================================================
// LegalSetu — complete a password reset with the emailed code
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { verifyOtp, otpFailureMessage } from "@/lib/otp/otp";

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
  password: z.string().min(8).max(100),
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
    return apiError(
      "VALIDATION_ERROR",
      "Please check the code and make sure the new password is at least 8 characters.",
      422
    );
  }

  const result = await verifyOtp(parsed.data.email, "PASSWORD_RESET", parsed.data.code);
  if (!result.ok) {
    return apiError("OTP_INVALID", otpFailureMessage(result.reason), 422);
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.update({
      where: { email: parsed.data.email.toLowerCase().trim() },
      data: { passwordHash },
      select: { id: true },
    });

    logger.info("Password reset completed", { userId: user.id });
    return apiSuccess({ reset: true });
  } catch (err) {
    logger.error("Password reset update failed", { errorType: String(err).slice(0, 200) });
    return apiError("RESET_FAILED", "Could not reset your password right now. Please try again.", 500);
  }
}
