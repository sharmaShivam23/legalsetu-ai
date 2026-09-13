// ==========================================================
// LegalSetu — voice-mode speech to text
// ----------------------------------------------------------
// One POST per spoken utterance. The client's voice-activity
// detector decides when the speaker has finished and posts just
// that slice of audio, which keeps each request small and the
// turnaround fast.
//
// Language is auto-detected by Sarvam rather than taken from the
// user's interface setting, so someone browsing in English can
// still speak Tamil and be understood.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sarvamTranscribe, isSarvamConfigured } from "@/lib/voice/sarvam";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Anything shorter than this is a click, a cough, or silence. */
const MIN_AUDIO_BYTES = 2_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  if (!isSarvamConfigured()) {
    return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
  }

  const rateLimit = await checkRateLimit(userId, "voiceRealtime");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too much speech too quickly. Pause a moment.", 429);
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("audio") as File | null;
  if (!file) return apiError("VALIDATION_ERROR", "No audio provided.", 422);

  if (file.size > MAX_AUDIO_BYTES) {
    return apiError("FILE_TOO_LARGE", "That was too long — try shorter sentences.", 413);
  }
  if (file.size < MIN_AUDIO_BYTES) {
    // Not an error worth surfacing as a failure: the caller just keeps listening.
    return apiSuccess({ transcript: "", languageCode: null, confidence: null, tooShort: true });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await sarvamTranscribe(buffer, file.type || "audio/webm");

    logger.info("Voice utterance transcribed", {
      userId,
      bytes: buffer.length,
      languageCode: result.languageCode,
      empty: result.transcript.length === 0,
    });

    return apiSuccess({ ...result, tooShort: false });
  } catch (err) {
    const message = String(err);
    if (message.includes("SARVAM_NOT_CONFIGURED")) {
      return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
    }
    logger.error("Voice transcription failed", { userId, errorType: message.slice(0, 200) });
    return apiError("STT_FAILED", "Could not hear that clearly. Please try again.", 502);
  }
}
