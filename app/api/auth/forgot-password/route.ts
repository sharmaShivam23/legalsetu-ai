// ==========================================================
// LegalSetu — request a password-reset code
// ----------------------------------------------------------
// Always returns the same success response whether or not the
// email has an account, so this cannot be used to enumerate
// registered users.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { issueOtp } from "@/lib/otp/otp";
import { sendEmail } from "@/lib/email/mailer";
import { buildPasswordResetEmail } from "@/lib/email/templates";

const OTP_EXPIRY_MINUTES = 10;

const schema = z.object({ email: z.string().email() });

const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a code to reset the password.";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "otpSend");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Please wait a few minutes before trying again.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Please enter a valid email address.", 422);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, passwordHash: true },
    });

    // No account, or an OAuth-only account with no password to reset —
    // either way, say nothing that distinguishes it from success.
    if (user && user.passwordHash) {
      const code = await issueOtp(user.email, "PASSWORD_RESET");
      const { subject, html, text } = buildPasswordResetEmail({
        name: user.name ?? undefined,
        code,
        expiryMinutes: OTP_EXPIRY_MINUTES,
      });
      await sendEmail({ to: user.email, subject, html, text });
      logger.info("Password reset code issued", { userId: user.id });
    }

    return apiSuccess({ message: GENERIC_MESSAGE });
  } catch (err) {
    logger.error("Forgot-password request failed", { errorType: String(err).slice(0, 200) });
    return apiSuccess({ message: GENERIC_MESSAGE });
  }
}
