// ==========================================================
// LegalSetu — User language preferences
// ----------------------------------------------------------
// Persists the chosen language so it follows the user across
// devices. Anonymous visitors keep their choice in a cookie +
// localStorage instead, so this returning 401 is expected and
// harmless.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { isSupportedLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n/languages";
import { logger } from "@/lib/logging/logger";

const languageField = z
  .string()
  .refine(isSupportedLanguage, "Unsupported language.")
  .optional();

const preferencesSchema = z.object({
  interfaceLanguage: languageField,
  responseLanguage: languageField,
  voiceLanguage: languageField,
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Sign in required.", 401);
  }
  const userId = (session.user as any).id as string;

  try {
    const preference = await prisma.userPreference.findUnique({
      where: { userId },
    });

    return apiSuccess({
      interfaceLanguage: preference?.interfaceLanguage ?? DEFAULT_LANGUAGE,
      responseLanguage: preference?.responseLanguage ?? DEFAULT_LANGUAGE,
      voiceLanguage: preference?.voiceLanguage ?? DEFAULT_LANGUAGE,
    });
  } catch (err) {
    logger.warn("Preference read failed", { userId, errorType: String(err) });
    return apiSuccess({
      interfaceLanguage: DEFAULT_LANGUAGE,
      responseLanguage: DEFAULT_LANGUAGE,
      voiceLanguage: DEFAULT_LANGUAGE,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Sign in required.", 401);
  }
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid language preference.", 422);
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updates).length === 0) {
    return apiError("VALIDATION_ERROR", "No preferences supplied.", 422);
  }

  try {
    const saved = await prisma.userPreference.upsert({
      where: { userId },
      update: updates,
      create: {
        userId,
        interfaceLanguage: DEFAULT_LANGUAGE,
        responseLanguage: DEFAULT_LANGUAGE,
        voiceLanguage: DEFAULT_LANGUAGE,
        ...updates,
      },
    });
    return apiSuccess(saved);
  } catch (err) {
    // Demo mode may have no database — the client keeps its local choice.
    logger.warn("Preference save skipped", { userId, errorType: String(err) });
    return apiSuccess({ userId, ...updates, persisted: false });
  }
}
