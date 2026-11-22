// ==========================================================
// LegalSetu — speech-to-text fallback: Groq Whisper
// ----------------------------------------------------------
// Voice mode prefers Sarvam (best for Indian languages), but Sarvam bills
// per request and answers HTTP 402 "No credits available" once the balance
// is gone — which silenced voice mode completely, because there was no
// second engine. Groq's Whisper is free-tier, fast (~0.5 s) and handles
// Hindi, English and the other major Indian languages, so it takes over.
//
// The result has the same shape as sarvamTranscribe(), including a language
// code such as "hi-IN", because the voice UI uses it to pick the reply's
// language and voice.
// ==========================================================

import { getKeysForProvider, withKeyRotation } from "@/lib/ai/key-pool";
import type { SarvamTranscript } from "./sarvam";
import { voiceAgent, type VoiceFetchInit } from "./http-agent";

const URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const TIMEOUT_MS = 15_000;

/** Whisper reports the language by English name; the app uses Sarvam-style codes. */
const NAME_TO_CODE: Record<string, string> = {
  english: "en-IN",
  hindi: "hi-IN",
  bengali: "bn-IN",
  gujarati: "gu-IN",
  kannada: "kn-IN",
  malayalam: "ml-IN",
  marathi: "mr-IN",
  punjabi: "pa-IN",
  tamil: "ta-IN",
  telugu: "te-IN",
  urdu: "ur-IN",
  assamese: "as-IN",
  nepali: "hi-IN", // Devanagari; closest voice
  sanskrit: "hi-IN",
};

/**
 * Opens the connection to Groq before the first question, so the first
 * utterance does not pay the TLS handshake. Any authenticated, cheap GET
 * will do; the response is irrelevant.
 */
export function prewarmGroqStt(): void {
  const [key] = getKeysForProvider("GROQ_API_KEY");
  if (!key) return;
  void fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5_000),
    dispatcher: voiceAgent,
  } as VoiceFetchInit)
    .then((r) => r.arrayBuffer())
    .catch(() => {});
}

export function isGroqSttConfigured(): boolean {
  return getKeysForProvider("GROQ_API_KEY").length > 0;
}

interface VerboseSegment {
  no_speech_prob?: number;
  avg_logprob?: number;
}

/**
 * Whisper is known to "hear" words in silence or noise ("Thank you.", "you").
 * Drop a transcript when every segment is probably not speech.
 */
export function looksLikeNoSpeech(segments: VerboseSegment[] | undefined): boolean {
  if (!segments || segments.length === 0) return false;
  return segments.every((s) => (s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -0.7);
}

/**
 * @param hint the interface language ("hi", "en"…). Only used to undo
 *   Whisper's best-known slip: spoken Hindi written out in Urdu script.
 */
export async function groqTranscribe(
  audio: Buffer,
  mimeType: string,
  hint?: string | null
): Promise<SarvamTranscript> {
  const baseType = mimeType.split(";")[0].trim().toLowerCase() || "audio/webm";
  const extension = baseType.includes("webm")
    ? "webm"
    : baseType.includes("ogg")
      ? "ogg"
      : baseType.includes("mp4") || baseType.includes("m4a")
        ? "m4a"
        : "wav";
  const model = process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3";

  const request = (language?: string) => withKeyRotation("GROQ_API_KEY", async (apiKey) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: baseType }), `utterance.${extension}`);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    if (language) form.append("language", language);
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      dispatcher: voiceAgent,
    } as VoiceFetchInit);
    if (!res.ok) {
      // Carry the status so the key pool can bench a rate-limited / rejected key.
      const err = new Error(`GROQ_STT_HTTP_${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as { text?: string; language?: string; segments?: VerboseSegment[] };
  });

  let json = await request();
  // Hindi and Urdu sound alike; Whisper sometimes writes Hindi speech in
  // Urdu script, which the app would then answer in Urdu. Unless the user
  // chose Urdu, read the clip again as Hindi.
  if (json.language?.toLowerCase() === "urdu" && hint !== "ur") {
    json = { ...(await request("hi")), language: "hindi" };
  }

  const text = (json.text ?? "").trim();
  if (!text || looksLikeNoSpeech(json.segments)) {
    return { transcript: "", languageCode: null, confidence: null };
  }
  const code = json.language ? (NAME_TO_CODE[json.language.toLowerCase()] ?? null) : null;
  return { transcript: text, languageCode: code, confidence: null };
}
