// app/api/auth/register/route.ts
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { registerSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

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
    // Extract Zod errors if you want to be specific, or fallback to generic message
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

  // 5. Create user and preferences
  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        preferences: {
          create: {
            interfaceLanguage: "en",
            responseLanguage: "en",
            voiceLanguage: "en",
          },
        },
      },
    });

    logger.info("User registered", { userId: user.id });
    
    // Return standard success response
    return apiSuccess({ id: user.id, email: user.email }, 201);
    
  } catch (err) {
    logger.error("Registration failed", { errorType: String(err) });
    return apiError("REGISTRATION_FAILED", "Could not create account due to a server error.", 500);
  }
}