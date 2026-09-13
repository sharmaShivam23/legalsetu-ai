// ==========================================================
// LegalSetu — resend a verification or password-reset code
// ----------------------------------------------------------
// The response is identical whether or not the email exists,
// or is already verified — otherwise this endpoint becomes a
// free way to check who has a LegalSetu account.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { issueOtp } from "@/lib/otp/otp";
import { sendEmail } from "@/lib/email/mailer";
import { buildVerificationEmail, buildPasswordResetEmail } from "@/lib/email/templates";

const OTP_EXPIRY_MINUTES = 10;

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]),
});

const GENERIC_MESSAGE =
  "If that email needs a new code, we've sent one. Please check your inbox.";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "otpSend");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Please wait a few minutes before requesting another code.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid request.", 422);
  }

  const { email, purpose } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, emailVerified: true },
    });

    const shouldSend =
      Boolean(user) &&
      (purpose === "PASSWORD_RESET" ? true : user!.emailVerified === null);

    if (shouldSend && user) {
      const code = await issueOtp(user.email, purpose);
      const { subject, html, text } =
        purpose === "EMAIL_VERIFICATION"
          ? buildVerificationEmail({ name: user.name ?? undefined, code, expiryMinutes: OTP_EXPIRY_MINUTES })
          : buildPasswordResetEmail({ name: user.name ?? undefined, code, expiryMinutes: OTP_EXPIRY_MINUTES });

      await sendEmail({ to: user.email, subject, html, text });
      logger.info("OTP resent", { purpose, userId: user.id });
    }

    // Same message whatever happened above.
    return apiSuccess({ message: GENERIC_MESSAGE });
  } catch (err) {
    logger.error("OTP resend failed", { errorType: String(err).slice(0, 200) });
    // Still generic — an internal failure must not distinguish itself
    // from "nothing to send" either.
    return apiSuccess({ message: GENERIC_MESSAGE });
  }
}
