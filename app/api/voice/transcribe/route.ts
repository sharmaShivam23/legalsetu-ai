import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { transcribeAudio } from "@/lib/voice/stt";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeLanguage } from "@/lib/i18n/languages";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "voiceTranscription");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("audio") as File | null;
  if (!file) return apiError("VALIDATION_ERROR", "No audio file provided.", 422);

  const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_AUDIO_BYTES) {
    return apiError("FILE_TOO_LARGE", "Audio exceeds 15MB limit.", 413);
  }

  // Which language the user is speaking — falls back to English.
  const language = normalizeLanguage(
    (formData?.get("language") as string | null) ?? undefined
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await transcribeAudio(buffer, file.type, language);

  return apiSuccess(result);
}
