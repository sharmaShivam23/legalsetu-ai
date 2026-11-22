// ==========================================================
// LegalSetu — speech services for phone calls
// ----------------------------------------------------------
// Hearing (speech-to-text) and speaking (text-to-speech), each with
// an ordered list of providers:
//
//   hear : Sarvam  ->  Groq Whisper
//   speak: Sarvam  ->  Gemini
//
// Sarvam is the best option for Indian languages and the only one fast
// enough to speak a reply in about a second. Its free credit runs out,
// so the others exist to keep the line working (slower) rather than
// dead. A provider that fails for lack of credit is set aside for ten
// minutes, so a dead one costs ONE slow turn, not every turn.
//
// All audio in and out of this module is what a phone line carries:
// 8 kHz, with synthesis returned as G.711 μ-law ready to send.
// ==========================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildWav, mulawDurationMs, parseWav, pcm16ToMulaw, resamplePcm16, PHONE_SAMPLE_RATE } from "./audio";
import { sarvamSpeak, sarvamTranscribe, resolveTtsLanguage, isSarvamConfigured } from "@/lib/voice/sarvam";
import { logger } from "@/lib/logging/logger";
import { createLiveVoice, type LiveVoice } from "./gemini-live";

export interface SttResult {
  text: string;
  languageCode: string | null;
  provider: string;
  ms: number;
}

export interface TtsResult {
  /** 8 kHz G.711 μ-law, ready to frame and send. */
  mulaw: Buffer;
  provider: string;
  ms: number;
}

export interface SpeechPort {
  /** `pcm` is 16-bit mono PCM at 8 kHz. */
  transcribe(pcm: Buffer, language: string): Promise<SttResult>;
  synthesize(text: string, language: string): Promise<TtsResult>;
  /** Fixed phrases: synthesised once, then served from a cache. Falls back to synthesize. */
  phrase?(text: string, language: string): Promise<TtsResult>;
  /**
   * A reply spoken AS IT IS GENERATED: μ-law chunks arrive while the rest is
   * still being made, so the caller hears the first words in about half a
   * second instead of waiting for the whole sentence. `meta.provider` is set
   * once the first chunk exists. Throws only if no provider could start.
   */
  synthesizeStream?(text: string, language: string, signal: AbortSignal): { meta: { provider: string }; chunks: AsyncGenerator<Buffer> };
  /** Opens voice sessions ahead of need (a call is about to start). */
  warm?(): Promise<void>;
}

// ---------------------------------------------------------------
// Provider health
// ---------------------------------------------------------------

const benched = new Map<string, number>();

// A provider that has no credit stays that way across a restart; without
// this every restart re-learned it the slow way (a 12 s timeout per call).
const BENCH_FILE = path.resolve(process.cwd(), ".cache", "call-bench.json");
const persistent = !process.env.VITEST; // tests must neither read nor write real state
try {
  if (!persistent) throw new Error("disabled");
  const saved = JSON.parse(fs.readFileSync(BENCH_FILE, "utf8")) as Record<string, number>;
  for (const [name, until] of Object.entries(saved)) if (until > Date.now()) benched.set(name, until);
} catch {
  /* no saved state */
}
function persistBench(): void {
  if (!persistent) return;
  try {
    fs.mkdirSync(path.dirname(BENCH_FILE), { recursive: true });
    fs.writeFileSync(BENCH_FILE, JSON.stringify(Object.fromEntries(benched)));
  } catch {
    /* read-only disk: fine */
  }
}
const CREDIT_BENCH_MS = 10 * 60 * 1000;
const RATE_BENCH_MS = 30 * 1000;

const isBenched = (name: string) => (benched.get(name) ?? 0) > Date.now();

function benchOnFailure(name: string, err: unknown): void {
  const msg = String((err as any)?.message ?? err);
  if (/402|credit|insufficient|quota|SARVAM_HTTP_40[123]/i.test(msg)) {
    benched.set(name, Date.now() + CREDIT_BENCH_MS);
    persistBench();
  } else if (/429|rate/i.test(msg)) benched.set(name, Date.now() + RATE_BENCH_MS);
  // Timeouts and refused connections: a provider that cannot be reached right
  // now is not worth a 10-15 s wait on the next utterance.
  else if (/timeout|timed out|unreachable|ECONN|ENOTFOUND|fetch failed|could not connect/i.test(msg)) {
    benched.set(name, Date.now() + 45_000);
  }
  // A live session that would not start is retried after a minute, not on
  // every sentence: each failed attempt costs seconds of silence.
  else if (name === "live") benched.set(name, Date.now() + 60_000);
}

/** For tests and for forcing a re-check after topping up credit. */
export function resetSpeechHealth(): void {
  benched.clear();
}

function order(envVar: string, auto: string[]): string[] {
  const forced = process.env[envVar]?.trim().toLowerCase();
  if (forced && forced !== "auto") return [forced];
  return auto;
}

/**
 * Starts the first provider; if it has not answered within hedgeMs (or fails
 * sooner) starts the next in parallel, and takes whichever succeeds first.
 * On a slow or lossy network one provider often stalls for 10+ seconds while
 * another answers in one, and waiting for the first to give up is the worst
 * of both.
 */
function hedged<T>(providers: string[], run: (name: string) => Promise<T>, what: string, hedgeMs: number): Promise<T> {
  const sorted = [...providers.filter((p) => !isBenched(p)), ...providers.filter(isBenched)];
  return new Promise<T>((resolve, reject) => {
    let next = 0;
    let pending = 0;
    let settled = false;
    let lastErr: unknown;
    let timer: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      settled = true;
      if (timer) clearInterval(timer);
    };
    const launch = (): boolean => {
      if (settled || next >= sorted.length) return false;
      const name = sorted[next++];
      pending++;
      run(name).then(
        (value) => {
          pending--;
          if (settled) return;
          finish();
          resolve(value);
        },
        (err) => {
          pending--;
          lastErr = err;
          benchOnFailure(name, err);
          logger.warn(`Call ${what} provider failed`, { provider: name, errorType: String(err).slice(0, 140) });
          if (settled) return;
          // Fail over at once rather than waiting out the hedge delay.
          if (!launch() && pending === 0) {
            finish();
            reject(lastErr);
          }
        }
      );
      return true;
    };
    if (!launch()) return reject(new Error(`No ${what} provider is configured`));
    timer = setInterval(() => void launch(), hedgeMs);
  });
}

async function firstWorking<T>(providers: string[], run: (name: string) => Promise<T>, what: string): Promise<T> {
  // Healthy providers first; benched ones only if nothing else is left.
  const sorted = [...providers.filter((p) => !isBenched(p)), ...providers.filter(isBenched)];
  let lastErr: unknown;
  for (const name of sorted) {
    try {
      return await run(name);
    } catch (err) {
      lastErr = err;
      benchOnFailure(name, err);
      logger.warn(`Call ${what} provider failed`, { provider: name, errorType: String(err).slice(0, 140) });
    }
  }
  throw lastErr ?? new Error(`No ${what} provider is configured`);
}

// ---------------------------------------------------------------
// Keys
// ---------------------------------------------------------------

function keysFor(prefix: string): string[] {
  const out: string[] = [];
  for (const name of [prefix, ...Array.from({ length: 10 }, (_, i) => `${prefix}_${i + 1}`)]) {
    const v = process.env[name]?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Tries each key until one is not rejected for quota/auth. */
async function withKeys<T>(prefix: string, run: (key: string) => Promise<Response>, parse: (res: Response) => Promise<T>): Promise<T> {
  const keys = keysFor(prefix);
  if (keys.length === 0) throw new Error(`No ${prefix} configured`);
  let last = "";
  // Start from a rotating offset so load spreads across keys.
  const start = Math.floor(Date.now() / 1000) % keys.length;
  for (let i = 0; i < keys.length; i++) {
    const res = await run(keys[(start + i) % keys.length]);
    if (res.ok) return parse(res);
    last = `${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`;
    if (![401, 402, 403, 429, 503].includes(res.status)) break;
  }
  throw new Error(`${prefix}: ${last}`);
}

// ---------------------------------------------------------------
// Hearing
// ---------------------------------------------------------------

/** Whisper's accepted language hints, by this app's language codes. */
const WHISPER_LANGS = new Set(["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "as"]);

/**
 * No vocabulary "hint" is sent. One was tried (legal terms such as tenant and
 * security deposit) and it made Whisper echo the hint instead of transcribing:
 * "my landlord has not returned my security deposit" came back as "my
 * landlord, किरायेदा, …" — the words the caller actually said were replaced by
 * a hint word. A wrong transcript silently corrupts a legal intake, so an
 * opt-in override exists but the default is none (CALL_WHISPER_PROMPT).
 */
async function groqTranscribe(pcm: Buffer, language: string): Promise<SttResult> {
  const started = Date.now();
  const base = language.split("-")[0].toLowerCase();
  const wav = buildWav(pcm, PHONE_SAMPLE_RATE);

  const json = await withKeys(
    "GROQ_API_KEY",
    (key) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utterance.wav");
      form.append("model", process.env.CALL_WHISPER_MODEL?.trim() || "whisper-large-v3");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      if (WHISPER_LANGS.has(base)) form.append("language", base);
      const prompt = process.env.CALL_WHISPER_PROMPT?.trim();
      if (prompt) form.append("prompt", prompt);
      return fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
    },
    (res) => res.json() as Promise<{ text?: string; segments?: { no_speech_prob?: number; avg_logprob?: number }[] }>
  );

  let text = (json.text ?? "").trim();
  // Whisper invents "Thank you." or "Thanks for watching" from line noise.
  // A segment it is itself unsure contains speech is not a real utterance.
  const segs = json.segments ?? [];
  if (segs.length > 0 && segs.every((s) => (s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -0.7)) text = "";
  if (/^(thanks? (you )?for watching|subtitles? by|www\.|\.+|you)\W*$/i.test(text)) text = "";

  return { text, languageCode: WHISPER_LANGS.has(base) ? base : null, provider: "groq", ms: Date.now() - started };
}

async function sarvamHear(pcm: Buffer): Promise<SttResult> {
  if (!isSarvamConfigured()) throw new Error("Sarvam not configured");
  const started = Date.now();
  const result = await sarvamTranscribe(buildWav(pcm, PHONE_SAMPLE_RATE), "audio/wav", "unknown");
  return { text: result.transcript, languageCode: result.languageCode, provider: "sarvam", ms: Date.now() - started };
}

// ---------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------

async function sarvamSpeakPhone(text: string, language: string): Promise<TtsResult> {
  if (!isSarvamConfigured()) throw new Error("Sarvam not configured");
  const { code } = resolveTtsLanguage(language);
  if (!code) throw new Error(`Sarvam has no voice for ${language}`);
  const started = Date.now();
  const wav = parseWav(await sarvamSpeak(text, code, undefined, PHONE_SAMPLE_RATE));
  const pcm8k = resamplePcm16(wav.pcm, wav.sampleRate, PHONE_SAMPLE_RATE);
  return { mulaw: pcm16ToMulaw(pcm8k), provider: "sarvam", ms: Date.now() - started };
}

async function geminiSpeak(text: string): Promise<TtsResult> {
  const started = Date.now();
  const model = process.env.CALL_GEMINI_TTS_MODEL?.trim() || "gemini-3.8-flash-lite-tts";
  const part = await withKeys(
    "GEMINI_API_KEY",
    (key) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.CALL_GEMINI_VOICE?.trim() || "Kore" } } },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }),
    async (res) => {
      const j = (await res.json()) as any;
      return j?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData as
        | { data: string; mimeType: string }
        | undefined;
    }
  );
  if (!part) throw new Error("Gemini returned no audio");
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const pcm8k = resamplePcm16(Buffer.from(part.data, "base64"), rate, PHONE_SAMPLE_RATE);
  return { mulaw: pcm16ToMulaw(pcm8k), provider: "gemini", ms: Date.now() - started };
}

// ---------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------

let liveVoice: LiveVoice | null = null;

/** One shared pool of live voice sessions for the whole process. */
function live(): LiveVoice {
  return (liveVoice ??= createLiveVoice({
    keys: () => keysFor("GEMINI_API_KEY"),
    model: process.env.CALL_LIVE_MODEL?.trim() || undefined,
    voice: process.env.CALL_GEMINI_VOICE?.trim() || undefined,
    maxSessions: Number(process.env.CALL_LIVE_SESSIONS) || 3,
    log: (level, message, data) => logger[level](message, data),
  }));
}

export function createSpeech(): SpeechPort {
  return {
    transcribe: (pcm, language) =>
      hedged(
        order("CALL_STT_PROVIDER", ["sarvam", "groq"]),
        (name) => (name === "sarvam" ? sarvamHear(pcm) : groqTranscribe(pcm, language)),
        "speech-to-text",
        Number(process.env.CALL_STT_HEDGE_MS) || 2500
      ),
    synthesize: (text, language) =>
      firstWorking(
        order("CALL_TTS_PROVIDER", ["sarvam", "gemini"]),
        (name) => (name === "sarvam" ? sarvamSpeakPhone(text, language) : geminiSpeak(text)),
        "text-to-speech"
      ),
    synthesizeStream(text, language, signal) {
      const meta = { provider: "" };
      async function* chunks(): AsyncGenerator<Buffer> {
        const providers = order("CALL_TTS_PROVIDER", ["live", "sarvam", "gemini"]);
        const sorted = [...providers.filter((p) => !isBenched(p)), ...providers.filter(isBenched)];
        let lastErr: unknown;
        for (const name of sorted) {
          if (signal.aborted) return;
          let started = false;
          try {
            if (name === "live") {
              meta.provider = "live";
              for await (const pcm of live().stream(text, signal)) {
                started = true;
                yield pcm16ToMulaw(pcm);
              }
              return;
            }
            const r = name === "sarvam" ? await sarvamSpeakPhone(text, language) : await geminiSpeak(text);
            meta.provider = r.provider;
            started = true;
            yield r.mulaw;
            return;
          } catch (err) {
            if (signal.aborted) return;
            lastErr = err;
            benchOnFailure(name, err);
            logger.warn("Call speech stream failed", { provider: name, started, errorType: String(err).slice(0, 140) });
            // Half a sentence has already been heard: it cannot be restarted elsewhere.
            if (started) return;
          }
        }
        throw lastErr ?? new Error("No text-to-speech provider is configured");
      }
      return { meta, chunks: chunks() };
    },
    warm: async () => {
      if (keysFor("GEMINI_API_KEY").length && order("CALL_TTS_PROVIDER", ["live"]).includes("live")) {
        await live().warm(2).catch(() => {});
      }
    },
  };
}

// ---------------------------------------------------------------
// Phrase cache
// ---------------------------------------------------------------

const CACHE_DIR = path.resolve(process.cwd(), ".cache", "call-phrases");

/**
 * Wraps a SpeechPort so FIXED phrases are synthesised once and kept on
 * disk, keyed by text + language + provider. The provider is part of the
 * key on purpose: audio made by a slow stand-in voice must not outlive
 * the outage that caused it.
 */
export function withPhraseCache(speech: SpeechPort): SpeechPort & { phrase(text: string, language: string): Promise<TtsResult> } {
  const memory = new Map<string, Promise<TtsResult>>();

  const phrase = (text: string, language: string): Promise<TtsResult> => {
    const memKey = `${language}|${text}`;
    const hit = memory.get(memKey);
    if (hit) return hit;

    const job = (async () => {
      // Entries are filed under the provider that ACTUALLY made the audio, and
      // looked up in order of preference. (They used to be filed under the
      // provider that was merely expected: with Sarvam out of credit the
      // fallback's audio was never stored, so every restart re-synthesised
      // the greeting from scratch — 25 s of silence on the first call.)
      // To switch to a better voice after topping up, delete .cache/call-phrases.
      const providers = order("CALL_TTS_PROVIDER", ["sarvam", "gemini"]);
      const fileFor = (provider: string) =>
        path.join(CACHE_DIR, crypto.createHash("sha1").update(provider + "|" + language + "|" + text).digest("hex") + ".mulaw");
      for (const provider of providers) {
        try {
          return { mulaw: fs.readFileSync(fileFor(provider)), provider: provider + "(cached)", ms: 0 };
        } catch {
          /* not cached under this provider */
        }
      }
      const fresh = await speech.synthesize(text, language);
      if (providers.includes(fresh.provider)) {
        try {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(fileFor(fresh.provider), fresh.mulaw);
        } catch {
          /* a read-only disk (serverless) just means no cache */
        }
      }
      return fresh;
    })();

    // A failed synthesis must not be cached as a permanent failure.
    job.catch(() => memory.delete(memKey));
    memory.set(memKey, job);
    return job;
  };

  return { ...speech, phrase };
}

export { mulawDurationMs };
