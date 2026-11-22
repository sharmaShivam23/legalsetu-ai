// ==========================================================
// LegalSetu — streaming speech from Gemini's live audio model
// ----------------------------------------------------------
// Why this exists: spoken replies were the slowest step of a call.
// Gemini's ordinary text-to-speech returns a whole clip only when it is
// finished — 3 to 8 seconds per sentence. The live audio model instead
// streams audio AS IT IS GENERATED: measured first sound 0.56-0.64 s,
// so the caller hears the reply start while the rest is still being made.
//
// It is a general voice model being told to read text aloud, so two
// things are handled explicitly:
//   - the instruction forbids answering, translating or editing, and the
//     output was checked against the input in Hindi and English;
//   - a reply that fails to start falls through to the other voices
//     (lib/calls/speech.ts), so a hiccup costs a delay, not the call.
//
// Sessions are expensive to open (1.5-3 s) and cheap to reuse, so a small
// pool is kept warm and each session serves many sentences in turn.
// ==========================================================

import { WebSocket } from "ws";

const SYSTEM_INSTRUCTION =
  "You are a text-to-speech engine, not an assistant. Whatever the user sends, read it aloud EXACTLY, word for word, " +
  "in the same language, in a calm, warm, natural voice. Never answer it, translate it, summarise it, or add or remove anything.";

export interface LiveVoiceOptions {
  /** API keys, tried in rotation. */
  keys: () => string[];
  model?: string;
  voice?: string;
  /** Most simultaneous sessions (sentences being spoken at once). */
  maxSessions?: number;
  /** A session is retired after this many sentences, to keep its context short. */
  maxUses?: number;
  /** How long a session may take to become ready. */
  openTimeoutMs?: number;
  /** How long to wait for the first sound once text is sent. */
  firstChunkTimeoutMs?: number;
  /** Override the endpoint (used by tests). */
  urlFor?: (key: string) => string;
  log?: (level: "info" | "warn", message: string, data?: Record<string, unknown>) => void;
}

const LIVE_URL = (key: string) =>
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

/**
 * 24 kHz -> 8 kHz by averaging each group of three samples, carrying
 * leftover samples between chunks so chunk boundaries never click.
 */
export class Downsampler24to8 {
  private carry: number[] = [];

  /** 16-bit LE PCM at 24 kHz in, 16-bit LE PCM at 8 kHz out. */
  push(pcm: Buffer): Buffer {
    const samples = this.carry;
    for (let i = 0; i + 1 < pcm.length; i += 2) samples.push(pcm.readInt16LE(i));
    const groups = Math.floor(samples.length / 3);
    const out = Buffer.alloc(groups * 2);
    for (let g = 0; g < groups; g++) {
      out.writeInt16LE(Math.round((samples[g * 3] + samples[g * 3 + 1] + samples[g * 3 + 2]) / 3), g * 2);
    }
    this.carry = samples.slice(groups * 3);
    return out;
  }
}

interface Turn {
  chunks: Buffer[];
  waiters: (() => void)[];
  done: boolean;
  error: Error | null;
  gotAudio: boolean;
}

class LiveSession {
  uses = 0;
  busy = false;
  dead = false;
  private turn: Turn | null = null;

  private constructor(private ws: WebSocket, private onDead: (s: LiveSession) => void) {
    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", () => this.die(new Error("live session closed")));
    ws.on("error", (e) => this.die(new Error(`live session error: ${String(e).slice(0, 80)}`)));
  }

  static open(url: string, setup: unknown, timeoutMs: number): Promise<LiveSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let session: LiveSession | null = null;
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error("live session did not become ready in time"));
      }, timeoutMs);

      ws.once("open", () => ws.send(JSON.stringify({ setup })));
      ws.on("message", (raw) => {
        if (session) return; // established: the session's own handler takes over
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.setupComplete) {
            clearTimeout(timer);
            ws.removeAllListeners("message");
            session = new LiveSession(ws, () => {});
            resolve(session);
          }
        } catch {
          /* wait for setupComplete */
        }
      });
      ws.once("close", (code, reason) => {
        clearTimeout(timer);
        if (!session) reject(new Error(`live session refused (${code} ${reason.toString().slice(0, 100)})`));
      });
      ws.once("error", (e) => {
        clearTimeout(timer);
        if (!session) reject(new Error(`live connection failed: ${String(e).slice(0, 100)}`));
      });
    });
  }

  setDeadHandler(h: (s: LiveSession) => void): void {
    this.onDead = h;
  }

  private notify(): void {
    const t = this.turn;
    if (!t) return;
    for (const w of t.waiters.splice(0)) w();
  }

  private onMessage(text: string): void {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const t = this.turn;
    for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && t) {
        t.chunks.push(Buffer.from(part.inlineData.data, "base64"));
        t.gotAudio = true;
      }
    }
    if (msg.serverContent?.turnComplete && t) t.done = true;
    if (msg.goAway) this.dead = true; // finish this sentence, then retire
    this.notify();
  }

  private die(err: Error): void {
    if (this.dead && !this.turn) return;
    this.dead = true;
    const t = this.turn;
    if (t && !t.done) t.error = err;
    this.notify();
    this.onDead(this);
  }

  /** Streams one sentence as 24 kHz PCM chunks. */
  async *speak(text: string, signal: AbortSignal, firstChunkTimeoutMs: number): AsyncGenerator<Buffer> {
    if (this.dead || this.ws.readyState !== this.ws.OPEN) throw new Error("live session is not open");
    const turn: Turn = { chunks: [], waiters: [], done: false, error: null, gotAudio: false };
    this.turn = turn;
    this.busy = true;

    const abort = () => {
      // Generation cannot be cancelled in place, so retire the session.
      this.dead = true;
      try {
        this.ws.terminate();
      } catch {
        /* already closed */
      }
      this.notify();
    };
    signal.addEventListener("abort", abort, { once: true });

    let aborted = false;
    try {
      this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
      const started = Date.now();
      let i = 0;
      for (;;) {
        if (signal.aborted) {
          aborted = true;
          return;
        }
        if (i < turn.chunks.length) {
          yield turn.chunks[i++];
          continue;
        }
        if (turn.error) throw turn.error;
        if (turn.done) break;
        if (!turn.gotAudio && Date.now() - started > firstChunkTimeoutMs) {
          this.dead = true;
          this.ws.terminate();
          throw new Error("live voice produced no audio in time");
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 250); // also re-checks the first-chunk deadline
          turn.waiters.push(() => {
            clearTimeout(t);
            resolve();
          });
        });
      }
      if (!turn.gotAudio) throw new Error("live voice returned no audio");
      this.uses++;
    } finally {
      signal.removeEventListener("abort", abort);
      this.turn = null;
      this.busy = false;
      if (aborted) this.dead = true;
    }
  }

  close(): void {
    this.dead = true;
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

export interface LiveVoice {
  /** Mulaw-ready 8 kHz PCM, streamed. Throws before the first chunk if it cannot start. */
  stream(text: string, signal: AbortSignal): AsyncGenerator<Buffer>;
  /** Opens sessions ahead of need. */
  warm(count: number): Promise<void>;
  close(): void;
  stats(): { sessions: number; idle: number };
}

export function createLiveVoice(options: LiveVoiceOptions): LiveVoice {
  const model = options.model ?? "gemini-3.8-live";
  const maxSessions = options.maxSessions ?? 3;
  const maxUses = options.maxUses ?? 12;
  const openTimeout = options.openTimeoutMs ?? 8000;
  const firstChunkTimeout = options.firstChunkTimeoutMs ?? 7000;
  const urlFor = options.urlFor ?? LIVE_URL;
  const log = options.log ?? (() => {});

  const setup = {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice ?? "Kore" } } },
    },
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
  };

  const all = new Set<LiveSession>();
  const idle: LiveSession[] = [];
  const waiting: ((s: LiveSession) => void)[] = [];
  let opening = 0;
  let keyRotation = 0;

  const forget = (s: LiveSession) => {
    all.delete(s);
    const at = idle.indexOf(s);
    if (at >= 0) idle.splice(at, 1);
  };

  async function openOne(timeoutMs: number = openTimeout): Promise<LiveSession> {
    const keys = options.keys();
    if (keys.length === 0) throw new Error("No Gemini API key configured");
    let lastErr: unknown;
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[(keyRotation + attempt) % keys.length];
      try {
        const s = await LiveSession.open(urlFor(key), setup, timeoutMs);
        keyRotation = (keyRotation + attempt + 1) % keys.length;
        s.setDeadHandler(forget);
        all.add(s);
        return s;
      } catch (err) {
        lastErr = err;
        log("warn", "Live session could not open", { error: String(err).slice(0, 120) });
      }
    }
    throw lastErr;
  }

  async function acquire(signal: AbortSignal): Promise<LiveSession> {
    while (idle.length) {
      const s = idle.pop()!;
      if (!s.dead) return s;
      forget(s);
    }
    if (all.size + opening < maxSessions) {
      opening++;
      try {
        return await openOne();
      } finally {
        opening--;
      }
    }
    // Everything is busy: wait for a session to come back.
    return new Promise<LiveSession>((resolve, reject) => {
      const onAbort = () => reject(new Error("aborted while waiting for a voice"));
      signal.addEventListener("abort", onAbort, { once: true });
      waiting.push((s) => {
        signal.removeEventListener("abort", onAbort);
        resolve(s);
      });
    });
  }

  function release(s: LiveSession): void {
    if (s.dead || s.uses >= maxUses) {
      forget(s);
      s.close();
      // A waiter needs a session and this one is gone: open a replacement for it.
      if (waiting.length && all.size + opening < maxSessions) {
        const next = waiting.shift()!;
        opening++;
        openOne().then(next, () => {}).finally(() => opening--);
      }
      return;
    }
    const next = waiting.shift();
    if (next) next(s);
    else idle.push(s);
  }

  return {
    async *stream(text, signal) {
      const session = await acquire(signal);
      const down = new Downsampler24to8();
      try {
        for await (const chunk of session.speak(text, signal, firstChunkTimeout)) {
          const pcm8k = down.push(chunk);
          if (pcm8k.length) yield pcm8k;
        }
      } finally {
        release(session);
      }
    },
    async warm(count) {
      const wanted = Math.min(count, maxSessions) - all.size - opening;
      const jobs: Promise<unknown>[] = [];
      for (let i = 0; i < wanted; i++) {
        opening++;
        jobs.push(
          // Nobody is waiting on a warm-up, so it may take as long as a slow
          // connection needs; a sentence waiting for a voice may not.
          openOne(Math.max(openTimeout, 25_000))
            .then((s) => idle.push(s))
            .catch(() => {})
            .finally(() => opening--)
        );
      }
      await Promise.all(jobs);
    },
    close() {
      for (const s of [...all]) s.close();
      all.clear();
      idle.length = 0;
    },
    stats: () => ({ sessions: all.size, idle: idle.length }),
  };
}
