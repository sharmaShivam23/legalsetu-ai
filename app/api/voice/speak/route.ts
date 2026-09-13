// ==========================================================
// LegalSetu — voice-mode text to speech
// ----------------------------------------------------------
// Called once per sentence, not once per answer. The client
// sends each sentence the moment the model finishes writing it
// and plays the clips back to back, so the reply starts being
// spoken while the rest of it is still being generated.
//
// Returns raw WAV bytes rather than JSON+base64 so the browser
// can hand it straight to an <audio> element with no decode step.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sarvamSpeak, resolveTtsLanguage, isSarvamConfigured, TTS_MAX_CHARS } from "@/lib/voice/sarvam";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  text: z.string().min(1).max(TTS_MAX_CHARS),
  /** This app's language code (e.g. "hi"), or a Sarvam code ("hi-IN"). */
  language: z.string().min(2).max(10).default("en"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  if (!isSarvamConfigured()) {
    return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
  }

  const rateLimit = await checkRateLimit(userId, "voiceRealtime");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many speech requests. Pause a moment.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid speech request.", 422);

  const { code, exact } = resolveTtsLanguage(parsed.data.language);
  if (!code) {
    // Urdu and anything else with no readable voice. The client falls
    // back to the browser's own synthesiser, or just shows the text.
    return apiError(
      "TTS_LANGUAGE_UNSUPPORTED",
      "There is no voice available for this language yet — showing the answer as text.",
      422
    );
  }

  try {
    const audio = await sarvamSpeak(parsed.data.text, code);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        // Lets the client warn once that a stand-in voice is being used.
        "X-Voice-Language": code,
        "X-Voice-Exact": exact ? "1" : "0",
      },
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("SARVAM_NOT_CONFIGURED")) {
      return apiError("VOICE_UNAVAILABLE", "Voice mode is not configured on this server.", 503);
    }
    logger.error("Voice synthesis failed", { userId, errorType: message.slice(0, 200) });
    return apiError("TTS_FAILED", "Could not generate speech for that reply.", 502);
  }
}
