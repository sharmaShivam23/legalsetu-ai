// app/api/auth/register/route.ts
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { registerSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { issueOtp } from "@/lib/otp/otp";
import { sendEmail } from "@/lib/email/mailer";
import { buildVerificationEmail } from "@/lib/email/templates";

const OTP_EXPIRY_MINUTES = 10;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";

  // 1. Rate Limiting Check
  const rateLimit = await checkRateLimit(ip, "register");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many registration attempts.", 429);
  }

  // 2. Parse & Validate Body
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid registration details. Please check your inputs.", 422);
  }

  // 3. Check for existing user
  const existing = await prisma.user
    .findUnique({ where: { email: parsed.data.email } })
    .catch(() => null);

  if (existing) {
    return apiError("EMAIL_IN_USE", "An account with this email already exists.", 409);
  }

  // 4. Hash password securely
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // 5. Create user, UNVERIFIED, and send the verification code.
  // The account exists from this point (so nobody else can register
  // the same email while this person still has the code in transit),
  // but sign-in is refused until emailVerified is set — see
  // lib/auth/config.ts.
  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        emailVerified: null,
        preferences: {
          create: {
            interfaceLanguage: "en",
            responseLanguage: "en",
            voiceLanguage: "en",
          },
        },
      },
    });

    const code = await issueOtp(user.email, "EMAIL_VERIFICATION");
    const { subject, html, text } = buildVerificationEmail({
      name: user.name ?? undefined,
      code,
      expiryMinutes: OTP_EXPIRY_MINUTES,
    });
    const sent = await sendEmail({ to: user.email, subject, html, text });

    logger.info("User registered, verification code issued", {
      userId: user.id,
      emailDelivered: sent.delivered,
    });

    return apiSuccess(
      {
        id: user.id,
        email: user.email,
        // Tells the client whether a real inbox was used, so the UI can
        // say "check your email" vs. point at the server console in a
        // local dev environment with no SMTP configured yet.
        devMode: sent.devMode,
      },
      201
    );
  } catch (err) {
    logger.error("Registration failed", { errorType: String(err) });
    return apiError("REGISTRATION_FAILED", "Could not create account due to a server error.", 500);
  }
}
