// ==========================================================
// LegalSetu — local voice engine (Ollama mode)
// ----------------------------------------------------------
// When Ollama mode is ON, voice mode must not depend on any API key:
//   speech -> text : faster-whisper, in voice-local/server.py (this machine)
//   answer         : Ollama (already wired through /api/chat/stream)
//   text -> speech : Piper in the same Python server if installed,
//                    otherwise the browser's own speech synthesis.
//
// The Python server is a long-lived process so Whisper stays loaded.
// It is started here on first use (and when Ollama mode is switched on),
// so nobody has to remember a second terminal. Set LOCAL_VOICE_AUTOSTART=0
// to manage it yourself (`npm run voice:local`).
// ==========================================================

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { SarvamTranscript } from "./sarvam";

export interface LocalVoiceHealth {
  ok: boolean;
  stt: { model: string; threads: number };
  /** Languages Piper can speak locally (e.g. ["en", "hi"]); empty = browser speaks. */
  tts: string[];
}

const HEALTH_TIMEOUT_MS = 1_500;
/** Whisper "small" loads in ~6-8 s on a laptop CPU; leave headroom for a cold disk. */
const START_TIMEOUT_MS = 60_000;
const STT_TIMEOUT_MS = 45_000;
const TTS_TIMEOUT_MS = 20_000;

export function localVoiceUrl(): string {
  return (process.env.LOCAL_VOICE_URL?.trim() || `http://127.0.0.1:${process.env.LOCAL_VOICE_PORT || 8765}`).replace(/\/$/, "");
}

type Holder = {
  child?: ChildProcess | null;
  starting?: Promise<LocalVoiceHealth | null> | null;
  health?: LocalVoiceHealth | null;
  healthAt?: number;
};
// globalThis: Next bundles each route separately, and dev hot-reloads modules;
// both would otherwise spawn their own copy of the server.
const g = globalThis as unknown as { __legalsetuLocalVoice?: Holder };
const holder: Holder = (g.__legalsetuLocalVoice ??= {});

export async function localVoiceHealth(): Promise<LocalVoiceHealth | null> {
  // Cached briefly: voice mode asks once per utterance and per clause.
  if (holder.health && holder.healthAt && Date.now() - holder.healthAt < 5_000) return holder.health;
  try {
    const res = await fetch(`${localVoiceUrl()}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const json = res.ok ? ((await res.json()) as LocalVoiceHealth) : null;
    holder.health = json?.ok ? json : null;
  } catch {
    holder.health = null;
  }
  holder.healthAt = Date.now();
  return holder.health;
}

function autostartAllowed(): boolean {
  const v = process.env.LOCAL_VOICE_AUTOSTART?.trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  // Serverless hosts cannot run a Python sidecar (nor reach Ollama).
  return !process.env.VERCEL;
}

function spawnServer(): ChildProcess | null {
  const script = path.join(process.cwd(), "voice-local", "server.py");
  if (!fs.existsSync(script)) return null;
  const python = process.env.LOCAL_VOICE_PYTHON?.trim() || (process.platform === "win32" ? "python" : "python3");
  const logFile = path.join(process.cwd(), "voice-local", "server.log");
  let out: number | "ignore" = "ignore";
  try {
    out = fs.openSync(logFile, "a");
  } catch {
    // Logging is a convenience; the server runs without it.
  }
  try {
    const child = spawn(python, [script], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", out, out],
      windowsHide: true,
    });
    child.on("exit", () => {
      if (holder.child === child) holder.child = null;
      holder.health = null;
    });
    child.on("error", () => {
      if (holder.child === child) holder.child = null;
    });
    return child;
  } catch {
    return null;
  }
}

/**
 * Health of the local voice server, starting it if needed. Concurrent callers
 * share one start-up. Resolves null if it cannot be started.
 */
export async function ensureLocalVoice(): Promise<LocalVoiceHealth | null> {
  const now = await localVoiceHealth();
  if (now) return now;
  if (holder.starting) return holder.starting;
  if (!autostartAllowed()) return null;

  holder.starting = (async () => {
    if (!holder.child || holder.child.exitCode !== null) holder.child = spawnServer();
    if (!holder.child) return null;
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (holder.child === null) return null; // exited (Python or faster-whisper missing)
      await new Promise((r) => setTimeout(r, 500));
      holder.healthAt = 0;
      const h = await localVoiceHealth();
      if (h) return h;
    }
    return null;
  })().finally(() => {
    holder.starting = null;
  });
  return holder.starting;
}

/** Same shape as sarvamTranscribe(): languageCode like "hi-IN" drives the reply language. */
export async function localTranscribe(audio: Buffer, hint?: string | null): Promise<SarvamTranscript> {
  const health = await ensureLocalVoice();
  if (!health) throw new Error("LOCAL_VOICE_UNAVAILABLE");
  const q = hint ? `?hint=${encodeURIComponent(hint)}` : "";
  const res = await fetch(`${localVoiceUrl()}/stt${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(STT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LOCAL_STT_HTTP_${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const json = (await res.json()) as { text?: string; language?: string | null };
  const text = (json.text ?? "").trim();
  return {
    transcript: text,
    languageCode: text && json.language ? `${json.language}-IN` : null,
    confidence: null,
  };
}

/** WAV bytes from a local Piper voice, or null when none exists for the language. */
export async function localSpeak(text: string, language: string): Promise<Buffer | null> {
  const lang = language.split("-")[0].toLowerCase();
  const health = await localVoiceHealth();
  if (!health || !health.tts.includes(lang)) return null;
  const res = await fetch(`${localVoiceUrl()}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
