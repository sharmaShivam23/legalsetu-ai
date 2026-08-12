import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { translationSchema } from "@/lib/validation/schemas";
import { translateText } from "@/lib/translation/translate";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "apiDefault");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  const body = await req.json().catch(() => null);
  const parsed = translationSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const text = await translateText(
    parsed.data.text,
    parsed.data.targetLanguage,
    parsed.data.sourceLanguage
  );

  return apiSuccess({ text });
}
