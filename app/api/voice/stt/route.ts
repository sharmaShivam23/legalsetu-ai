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
import { sarvamTranscribe, isSarvamConfigured, sarvamOutOfCredit, type SarvamTranscript } from "@/lib/voice/sarvam";
import { groqTranscribe, isGroqSttConfigured } from "@/lib/voice/groq-stt";
import { logger } from "@/lib/logging/logger";
import { isOllamaMode } from "@/lib/ai/mode";
import { localTranscribe } from "@/lib/voice/local-voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Anything shorter than this is a click, a cough, or silence. */
const MIN_AUDIO_BYTES = 2_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/**
 * After Sarvam fails because it has no credit, rejects every key, or cannot
 * be reached, stop trying it for a while. Otherwise every sentence would
 * first wait on four failed requests before the fallback even starts.
 */
const SARVAM_COOLDOWN_MS = 5 * 60 * 1000;
let sarvamDownUntil = 0;

function sarvamShouldBeSkipped(): boolean {
  return !isSarvamConfigured() || sarvamOutOfCredit() || Date.now() < sarvamDownUntil;
}

/**
 * Ollama mode: local Whisper only — no API key, nothing leaves the machine.
 * Otherwise Sarvam first; Groq Whisper when Sarvam is unavailable or fails.
 */
async function transcribe(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  hint: string | null
): Promise<SarvamTranscript & { engine: string }> {
  if (isOllamaMode()) {
    return { ...(await localTranscribe(buffer, hint)), engine: "local-whisper" };
  }
  if (!sarvamShouldBeSkipped()) {
    try {
      return { ...(await sarvamTranscribe(buffer, mimeType)), engine: "sarvam" };
    } catch (err) {
      const message = String(err);
      if (/SARVAM_HTTP_(401|402|403|429)|SARVAM_UNREACHABLE/.test(message)) {
        sarvamDownUntil = Date.now() + SARVAM_COOLDOWN_MS;
      }
      logger.warn("Sarvam speech-to-text failed, using Groq Whisper", { userId, errorType: message.slice(0, 120) });
      if (!isGroqSttConfigured()) throw err;
    }
  }
  if (!isGroqSttConfigured()) throw new Error("SARVAM_NOT_CONFIGURED");
  return { ...(await groqTranscribe(buffer, mimeType, hint)), engine: "groq" };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = ((session?.user as any)?.id as string) || req.headers.get("x-forwarded-for") || "guest_voice_user";

  const local = isOllamaMode();
  if (!local && !isSarvamConfigured() && !isGroqSttConfigured()) {
    return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
  }

  const rateLimit = await checkRateLimit(userId, "voiceRealtime");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too much speech too quickly. Pause a moment.", 429);
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("audio") as File | null;
  // The interface language: a tie-breaker for local Whisper, and for Groq
  // Whisper's Hindi-vs-Urdu script choice. Sarvam detects on its own.
  const rawHint = formData?.get("language");
  const hint = typeof rawHint === "string" && /^[a-z]{2,3}$/.test(rawHint) ? rawHint : null;
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
    const sttStartedAt = Date.now();
    const result = await transcribe(buffer, file.type || "audio/webm", userId, hint);

    logger.info("Voice utterance transcribed", {
      userId,
      bytes: buffer.length,
      languageCode: result.languageCode,
      engine: result.engine,
      engineMs: Date.now() - sttStartedAt,
      empty: result.transcript.length === 0,
    });

    const { engine: _engine, ...body } = result;
    return apiSuccess({ ...body, tooShort: false });
  } catch (err) {
    const message = String(err);
    if (message.includes("SARVAM_NOT_CONFIGURED")) {
      return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
    }
    if (local) {
      logger.error("Local speech recognition failed", { userId, errorType: message.slice(0, 200) });
      return apiError(
        "LOCAL_STT_UNAVAILABLE",
        message.includes("LOCAL_VOICE_UNAVAILABLE")
          ? "Local speech recognition could not start. Run `npm run voice:local` and check that Python has faster-whisper installed."
          : "Local speech recognition failed on that clip. Please try again.",
        503
      );
    }
    logger.error("Voice transcription failed", { userId, errorType: message.slice(0, 200) });
    return apiError("STT_FAILED", "Could not hear that clearly. Please try again.", 502);
  }
}
