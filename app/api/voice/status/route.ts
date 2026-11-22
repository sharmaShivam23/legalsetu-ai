// ==========================================================
// LegalSetu — which voice engines are in use right now
// ----------------------------------------------------------
// GET /api/voice/status
//   { local: false, serverTts }              cloud: Sarvam/Groq hear, Sarvam
//                                            speaks if it has credit
//                                            (serverTts), else the browser
//   { local: true, ready, sttModel, tts }    Ollama mode: Whisper + Ollama
//                                            on this machine; `tts` lists
//                                            languages with a local voice
//                                            (empty = the browser speaks)
//
// Voice mode calls this when it opens. In Ollama mode the call also
// starts the local speech server and loads the Ollama model into memory,
// so the first question is not the one that pays for both cold starts.
// ==========================================================

import { auth } from "@/lib/auth/auth";
import { apiSuccess } from "@/lib/utils/api-response";
import { isOllamaMode } from "@/lib/ai/mode";
import { ensureLocalVoice } from "@/lib/voice/local-voice";
import { sarvamTtsAvailable } from "@/lib/voice/sarvam";
import { prewarmGroqStt } from "@/lib/voice/groq-stt";
import { ollamaModel, warmUpOllama } from "@/lib/ai/ollama";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  // Voice mode works signed out too (see /api/voice/stt); so does this.
  await auth().catch(() => null);

  if (!isOllamaMode()) {
    // Groq Whisper hears whenever Sarvam cannot (today: out of credit).
    // Open its connection now, alongside the Sarvam check, so the first
    // question does not pay the TLS handshake.
    prewarmGroqStt();
    return apiSuccess({ local: false, serverTts: await sarvamTtsAvailable() });
  }

  void warmUpOllama();
  const health = await ensureLocalVoice();
  return apiSuccess({
    local: true,
    ready: Boolean(health),
    sttModel: health?.stt.model ?? null,
    tts: health?.tts ?? [],
    llm: ollamaModel(),
  });
}
