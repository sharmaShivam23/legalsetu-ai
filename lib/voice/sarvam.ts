// ==========================================================
// LegalSetu — Sarvam speech services (server-side only)
// ----------------------------------------------------------
// Sarvam is used for both halves of voice mode because it is
// built for Indian languages specifically: its STT auto-detects
// which of ~20 Indian languages is being spoken (something the
// browser's own recogniser cannot do), and its Bulbul voices
// read Indian scripts naturally.
//
// This module is imported ONLY from route handlers. The
// subscription key never reaches the browser — the client talks
// to /api/voice/* and those routes talk to Sarvam.
//
// Verified against the live API (Sept 2026):
//   STT  POST /speech-to-text     multipart: file, model, language_code
//        -> { transcript, language_code, language_probability }
//   TTS  POST /text-to-speech     json: text, language_code, model, speaker
//        -> { audios: [base64 wav] }
// `bulbul:v2` is deprecated and now rejected outright; v3 is the
// live model.
// ==========================================================

import { logger } from "@/lib/logging/logger";

const STT_URL = "https://api.sarvam.ai/speech-to-text";
const TTS_URL = "https://api.sarvam.ai/text-to-speech";

const STT_MODEL = "saaras:v3";
const TTS_MODEL = "bulbul:v3";
const DEFAULT_SPEAKER = process.env.SARVAM_TTS_SPEAKER?.trim() || "ritu";

/** Bulbul's own limit is 2500 chars for v3; stay well inside it. */
export const TTS_MAX_CHARS = 1800;

/** Every configured key, in priority order, no duplicates. */
export function getSarvamKeys(): string[] {
  const keys: string[] = [];
  const push = (value?: string) => {
    const key = value?.trim();
    if (key && !keys.includes(key)) keys.push(key);
  };
  push(process.env.SARVAM_API_KEY);
  for (let i = 1; i <= 5; i++) push(process.env[`SARVAM_API_KEY_${i}`]);
  return keys;
}

export function isSarvamConfigured(): boolean {
  return getSarvamKeys().length > 0;
}

/** Languages Bulbul can actually speak, keyed by this app's language codes. */
const TTS_EXACT: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  or: "od-IN", // Sarvam spells Odia "od", this app uses "or"
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN",
};

/**
 * Languages Bulbul has no voice for, mapped to the closest voice that
 * can still read the script correctly. Maithili, Bhojpuri and Santali
 * text is Devanagari, so a Hindi voice pronounces it intelligibly —
 * the same substitution lib/i18n/languages.ts already makes for
 * browser speech. Assamese uses the Bengali-Assamese script.
 *
 * Urdu is deliberately absent: it is written in a Perso-Arabic script
 * that none of the available voices can read, so guessing a voice
 * would produce gibberish. Callers fall back to text for it.
 */
const TTS_NEAREST: Record<string, string> = {
  mai: "hi-IN",
  bho: "hi-IN",
  sat: "hi-IN",
  as: "bn-IN",
};

export interface TtsLanguage {
  /** Sarvam language code, or null when nothing can read this script. */
  code: string | null;
  /** False when a near-neighbour voice is standing in. */
  exact: boolean;
}

export function resolveTtsLanguage(appLanguage: string | undefined): TtsLanguage {
  const base = (appLanguage ?? "en").split("-")[0].toLowerCase();
  if (TTS_EXACT[base]) return { code: TTS_EXACT[base], exact: true };
  if (TTS_NEAREST[base]) return { code: TTS_NEAREST[base], exact: false };
  return { code: null, exact: false };
}

/** 429/401/403 are worth retrying on the next key; 4xx bodies are not. */
function shouldRotate(status: number): boolean {
  return status === 429 || status === 401 || status === 403;
}

/**
 * Cap per-call time. Voice mode is only usable if a failure is quick:
 * a stalled connection that takes 11s to give up makes every sentence
 * feel broken, where a fast failure lets the caller move on.
 */
const REQUEST_TIMEOUT_MS = 12_000;

async function callSarvam(
  url: string,
  build: (key: string) => RequestInit,
  label: string
): Promise<Response> {
  const keys = getSarvamKeys();
  if (keys.length === 0) {
    throw new Error("SARVAM_NOT_CONFIGURED");
  }

  let lastStatus = 0;
  let lastBody = "";

  for (const key of keys) {
    let res: Response;
    try {
      res = await fetch(url, { ...build(key), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      // Network-level failure (DNS, unroutable address, timeout) rather
      // than an HTTP error — worth naming separately, because the fix is
      // usually connectivity and not the key.
      logger.error("Sarvam request could not connect", {
        label,
        errorType: String((err as any)?.cause?.code ?? (err as any)?.name ?? err).slice(0, 120),
      });
      throw new Error("SARVAM_UNREACHABLE");
    }

    if (res.ok) return res;

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");

    if (!shouldRotate(res.status)) break;
    logger.warn("Sarvam key rejected, trying next", { label, status: res.status });
  }

  logger.error("Sarvam request failed", {
    label,
    status: lastStatus,
    errorType: lastBody.slice(0, 200),
  });
  throw new Error(`SARVAM_HTTP_${lastStatus}`);
}

export interface SarvamTranscript {
  transcript: string;
  /** Detected language, e.g. "hi-IN". Null if Sarvam could not tell. */
  languageCode: string | null;
  confidence: number | null;
}

/**
 * Transcribes one utterance. `languageCode` is left as "unknown" so
 * Sarvam identifies the language itself — a caller speaking Tamil does
 * not have to have set their interface to Tamil first.
 */
export async function sarvamTranscribe(
  audio: Buffer,
  mimeType: string,
  languageCode = "unknown"
): Promise<SarvamTranscript> {
  // Sarvam matches the content type as an exact string, so the codec
  // parameter the browser attaches has to go: MediaRecorder reports
  // "audio/webm;codecs=opus", which is rejected outright, while the
  // bare "audio/webm" is accepted.
  const baseType = mimeType.split(";")[0].trim().toLowerCase() || "audio/webm";

  const extension = baseType.includes("webm")
    ? "webm"
    : baseType.includes("ogg")
      ? "ogg"
      : baseType.includes("mp4")
        ? "mp4"
        : "wav";

  const res = await callSarvam(
    STT_URL,
    (key) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: baseType }), `utterance.${extension}`);
      form.append("model", STT_MODEL);
      form.append("language_code", languageCode);
      return { method: "POST", headers: { "api-subscription-key": key }, body: form };
    },
    "stt"
  );

  const json = (await res.json()) as {
    transcript?: string;
    language_code?: string | null;
    language_probability?: number | null;
  };

  return {
    transcript: (json.transcript ?? "").trim(),
    languageCode: json.language_code ?? null,
    confidence: json.language_probability ?? null,
  };
}

/** Synthesises one chunk of speech and returns WAV bytes. */
export async function sarvamSpeak(
  text: string,
  languageCode: string,
  speaker = DEFAULT_SPEAKER
): Promise<Buffer> {
  const res = await callSarvam(
    TTS_URL,
    (key) => ({
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, TTS_MAX_CHARS),
        language_code: languageCode,
        model: TTS_MODEL,
        speaker,
        speech_sample_rate: 22050,
      }),
    }),
    "tts"
  );

  const json = (await res.json()) as { audios?: string[] };
  const base64 = json.audios?.[0];
  if (!base64) throw new Error("SARVAM_EMPTY_AUDIO");
  return Buffer.from(base64, "base64");
}
