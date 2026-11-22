// ==========================================================
// LegalSetu — the live call engine
// ----------------------------------------------------------
// One CallRunner is one phone call. It owns the conversation loop:
//
//   hear the caller -> notice they finished -> transcribe -> ask the
//   AI -> speak the reply clause by clause as it is being written
//
// and the things that make a call feel alive rather than like a form:
//   - an acknowledgement ("okay, I see") if the answer is slow
//   - the caller can interrupt, and a half-finished thought is merged
//     with what they say next instead of being thrown away
//   - silence prompts, a time limit, an emergency message
//
// It talks to the outside world only through three small interfaces
// (Transport, SpeechPort, ChatPort), so the whole loop is testable
// without a phone line, a speech provider or an AI.
// ==========================================================

import { Endpointer } from "./endpoint";
import { FRAME_SAMPLES, mulawDurationMs, mulawToPcm16, toFrames } from "./audio";
import { phrasesFor } from "./phrases";
import { isEmergency } from "./emergency";
import type { SpeechPort, TtsResult } from "./speech";
import type { ChatPort, EventsPort, TurnMetric } from "./chat-client";
import { extractClauses, toSpeakable } from "@/lib/voice/speech-text";

/** What the runner needs from the phone line. */
export interface Transport {
  /** One 20 ms μ-law frame to the caller. */
  sendFrame(mulaw: Buffer): void;
  /** Ask the line to echo `name` back once everything sent so far has been played. */
  mark(name: string): void;
  /** Send any frames queued so far now. Optional: a line that sends each frame at once needs none. */
  flush?(): void;
  /** Discard audio the line has buffered but not yet played. */
  clear(): void;
  close(): void;
}

export interface RunnerOptions {
  language: string;
  transport: Transport;
  speech: SpeechPort;
  chat: ChatPort;
  events: EventsPort;
  now?: () => number;
  log?: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;
  /** Reply audio is sent the instant the first clause is ready; the acknowledgement fires if nothing is by then. */
  fillerAfterMs?: number;
  /** Silence before each of the three prompts (the third ends the call). */
  silenceMs?: [number, number, number];
  maxCallMs?: number;
  /** Characters in the first spoken clause: short, because it is the one the caller waits for in silence. */
  firstClauseMin?: number;
  firstClauseMax?: number;
  /**
   * Silence, from the END OF SPEECH, after which the caller is considered
   * to have finished and the AI is asked. Transcription starts earlier (at
   * the endpointer's shorter pause) and overlaps this wait, so it costs
   * little time — but it stops a mid-sentence pause from sending half a
   * sentence to the AI, which would save it, answer it and spend one of the
   * case intake's questions on it.
   */
  commitMs?: number;
  /** Synthesise the fixed phrases ahead of need. On by default; tests switch it off. */
  prewarm?: boolean;
  /**
   * The most characters of one AI answer that will be SPOKEN. The prompt asks
   * for a short phone reply, but a prompt is a request, not a guarantee: one
   * run produced 70 seconds of speech. Past this the call says the rest is
   * saved in the history (it is: the server keeps generating and saves the
   * whole answer) and moves on.
   */
  maxSpokenChars?: number;
}

/** One sentence of audio, which may still be arriving. */
interface ClipSource {
  chunks: AsyncIterable<Buffer>;
}

const once = (mulaw: Buffer): ClipSource => ({
  chunks: (async function* () {
    yield mulaw;
  })(),
});

/**
 * Starts pulling from `source` immediately and replays what it has
 * gathered. This is what lets the NEXT sentence be synthesised while the
 * current one is still playing: its chunks pile up here, ready.
 */
function buffered(source: AsyncIterable<Buffer>, onFirst: () => void): ClipSource {
  const gathered: Buffer[] = [];
  const waiters: (() => void)[] = [];
  let finished = false;
  let failure: unknown = null;
  const wake = () => waiters.splice(0).forEach((w) => w());

  void (async () => {
    try {
      let first = true;
      for await (const chunk of source) {
        if (first) {
          first = false;
          onFirst();
        }
        gathered.push(chunk);
        wake();
      }
    } catch (err) {
      failure = err;
    } finally {
      finished = true;
      wake();
    }
  })();

  return {
    chunks: (async function* () {
      let i = 0;
      for (;;) {
        if (i < gathered.length) yield gathered[i++];
        else if (finished) {
          if (failure && gathered.length === 0) throw failure;
          return;
        } else await new Promise<void>((resolve) => waiters.push(resolve));
      }
    })(),
  };
}

interface Turn {
  id: number;
  abort: AbortController;
  /** Stops READING the AI's answer (when it is long enough to cap) without stopping the speech. */
  chatAbort: AbortController;
  spokenChars: number;
  truncated: boolean;
  queue: Promise<ClipSource | null>[];
  pumping: boolean;
  streamDone: boolean;
  cancelled: boolean;
  /** Cancelled because the caller started speaking again. */
  cancelledByCaller: boolean;
  /** The AI has been asked. After this, interrupting cannot take the words back. */
  committed: boolean;
  /** Wakes the pre-commit wait early when the turn is cancelled. */
  wake: (() => void) | null;
  endOfSpeechAt: number;
  answer: string;
  spokenLen: number;
  clausesSpoken: number;
  firstAnswerAudioAt: number | null;
  filler: ReturnType<typeof setTimeout> | null;
  fillerPlayed: boolean;
  transcript: string;
  metric: Partial<TurnMetric>;
  reported: boolean;
}

export class CallRunner {
  private o: Required<Omit<RunnerOptions, "transport" | "speech" | "chat" | "events" | "log">> &
    Pick<RunnerOptions, "transport" | "speech" | "chat" | "events" | "log">;
  private endpointer = new Endpointer();
  private phrases;
  private startedAt: number;

  private turn: Turn | null = null;
  private turnCounter = 0;
  private marks = new Set<string>();
  private markCounter = 0;
  private carryOver = "";
  private retries = 0;
  private silenceStage = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private closeAfterPlayback: string | null = null;
  private closeSafety: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private heardCaller = false;

  constructor(options: RunnerOptions) {
    // An option passed as undefined must fall back to its default, not
    // replace it: a spread would turn an unset maxCallMs into a timer
    // that fires at once and hangs up every call as it connects.
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.o = {
      prewarm: true,
      commitMs: 900,
      // ~30 s of speech: Indian-language speech runs about 13 characters a
      // second, so 700 characters was a 54 s monologue.
      maxSpokenChars: 420,
      now: () => Date.now(),
      fillerAfterMs: 1300,
      silenceMs: [14_000, 12_000, 10_000],
      maxCallMs: 10 * 60_000,
      firstClauseMin: 24,
      firstClauseMax: 60,
      ...given,
    } as typeof this.o;
    this.phrases = phrasesFor(options.language);
    this.startedAt = this.o.now();
  }

  private log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
    this.o.log?.(level, message, data);
  }

  // ------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------

  /** Call once the line is connected. */
  async start(): Promise<void> {
    void this.o.events.started();
    this.capTimer = setTimeout(() => {
      void this.endCall(this.phrases.timeLimit, "time-limit");
    }, this.o.maxCallMs);

    // Warm the cache for the phrases we are likely to need, in the order we need them.
    const speech = this.o.speech;
    const warm = this.o.prewarm ? speech.phrase?.bind(speech) : undefined;
    if (warm) {
      void (async () => {
        for (const text of [this.phrases.acks[0], this.phrases.retry, this.phrases.silence, this.phrases.goodbye]) {
          await warm(text, this.o.language).catch(() => {});
        }
      })();
    }

    await this.speakFixed(this.phrases.greeting);
  }

  /** The line reported it is closing, or we are tearing down. Safe to call twice. */
  async stop(reason: string): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.clearSilence();
    if (this.capTimer) clearTimeout(this.capTimer);
    if (this.closeSafety) clearTimeout(this.closeSafety);
    if (this.turn) this.cancelTurn(this.turn, true);
    const durationSec = Math.max(0, Math.round((this.o.now() - this.startedAt) / 1000));
    await this.o.events.ended({ durationSec, reason });
  }

  // ------------------------------------------------------------
  // Inbound audio
  // ------------------------------------------------------------

  onAudio(mulawFrame: Buffer): void {
    if (this.stopped || this.closeAfterPlayback) return;
    const pcm = mulawToPcm16(mulawFrame);
    for (const ev of this.endpointer.push(pcm)) {
      if (ev.type === "speech-start") this.onSpeechStart();
      else if (ev.type === "utterance") this.onUtterance(ev.pcm);
    }
  }

  /** The line echoed a mark: everything sent before it has now been heard. */
  onMark(name: string): void {
    if (!this.marks.delete(name)) return;
    this.maybeIdle();
  }

  private onSpeechStart(): void {
    this.heardCaller = true;
    this.clearSilence();
    this.silenceStage = 0;
    // Speaking over the assistant, or resuming before it has answered.
    if (this.turn || this.marks.size > 0) this.interrupt();
  }

  private interrupt(): void {
    this.o.transport.clear();
    this.marks.clear();
    if (this.turn) this.cancelTurn(this.turn, true);
    this.endpointer.setPlayback(false);
  }

  // ------------------------------------------------------------
  // One turn
  // ------------------------------------------------------------

  private onUtterance(pcm: Buffer): void {
    if (this.stopped) return;
    const endOfSpeechAt = this.o.now() - this.endpointer.hangoverMs;
    const turn: Turn = {
      id: ++this.turnCounter,
      abort: new AbortController(),
      chatAbort: new AbortController(),
      spokenChars: 0,
      truncated: false,
      queue: [],
      pumping: false,
      streamDone: false,
      cancelled: false,
      cancelledByCaller: false,
      committed: false,
      wake: null,
      endOfSpeechAt,
      answer: "",
      spokenLen: 0,
      clausesSpoken: 0,
      firstAnswerAudioAt: null,
      filler: null,
      fillerPlayed: false,
      transcript: "",
      metric: {},
      reported: false,
    };
    this.turn = turn;
    turn.filler = setTimeout(() => void this.playFiller(turn), this.o.fillerAfterMs);
    void this.process(turn, pcm).catch((err) => {
      // A bug or a dropped connection inside one turn must not take the whole call down.
      this.log("error", "Turn crashed", { turn: turn.id, error: String(err).slice(0, 200) });
      if (turn.cancelled) return;
      this.dropTurn(turn);
      void this.sayRetryOrEnd(this.phrases.techError);
    });
  }

  private async process(turn: Turn, pcm: Buffer): Promise<void> {
    const tStt = this.o.now();
    let stt;
    try {
      stt = await this.o.speech.transcribe(pcm, this.o.language);
    } catch (err) {
      this.log("error", "Transcription failed", { error: String(err).slice(0, 160) });
      if (turn.cancelled) return;
      this.dropTurn(turn);
      await this.sayRetryOrEnd(this.phrases.techError);
      return;
    }
    if (turn.cancelled) {
      // The caller resumed while this was being transcribed. What they had
      // already said still counts — join it to what they say next.
      if (turn.cancelledByCaller && stt.text.trim()) {
        this.carryOver = `${this.carryOver} ${stt.text.trim()}`.trim();
      }
      return;
    }
    turn.metric.sttMs = this.o.now() - tStt;
    turn.metric.sttProvider = stt.provider;

    const heard = stt.text.trim();
    const text = `${this.carryOver} ${heard}`.trim();
    if (!/\p{L}/u.test(text) || text.length < 2) {
      this.dropTurn(turn);
      await this.sayRetryOrEnd(this.phrases.retry);
      return;
    }
    turn.transcript = text;

    // Hold the question for a moment: if the caller resumes within the
    // window, this turn is cancelled and its words join the next one.
    const wait = turn.endOfSpeechAt + this.o.commitMs - this.o.now();
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, wait);
        turn.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      turn.wake = null;
    }
    if (turn.cancelled) return;
    turn.committed = true;
    this.carryOver = "";
    this.retries = 0;
    this.log("info", "Caller said", { turn: turn.id, text: text.slice(0, 120), sttMs: turn.metric.sttMs, provider: stt.provider });

    if (isEmergency(text)) this.queueFixed(turn, this.phrases.emergency);

    const tChat = this.o.now();
    let failure: string | null = null;
    // Either handle stops the request: chatAbort when the answer is long enough
    // to cap, abort when the whole turn is cancelled.
    const stopChat = () => turn.chatAbort.abort();
    turn.abort.signal.addEventListener("abort", stopChat, { once: true });
    for await (const ev of this.o.chat.turn(text, turn.chatAbort.signal)) {
      if (turn.cancelled) return;
      if (ev.type === "token") {
        if (turn.metric.llmFirstTokenMs == null) turn.metric.llmFirstTokenMs = this.o.now() - tChat;
        turn.answer += ev.delta;
        this.feedClauses(turn, false);
      } else if (ev.type === "kind") {
        turn.metric.kind = ev.kind;
      } else if (ev.type === "error") {
        failure = ev.message;
      }
    }
    if (turn.cancelled) return;

    this.feedClauses(turn, true);
    if (turn.clausesSpoken === 0) {
      this.log("error", "The AI produced nothing to say", { turn: turn.id, failure });
      this.queueFixed(turn, this.phrases.techError);
    }
    turn.streamDone = true;
    void this.pump(turn);
  }

  /** Cuts completed clauses out of the growing answer and sends them to be spoken. */
  private feedClauses(turn: Turn, final: boolean): void {
    const speakable = toSpeakable(turn.answer);
    if (speakable.length <= turn.spokenLen) return;
    const fresh = speakable.slice(turn.spokenLen);

    if (final) {
      const rest = fresh.trim();
      if (rest) this.queueClause(turn, rest);
      turn.spokenLen = speakable.length;
      return;
    }
    const first = turn.clausesSpoken === 0;
    const { sentences, rest } = extractClauses(
      fresh,
      first ? this.o.firstClauseMin : undefined,
      first ? this.o.firstClauseMax : undefined
    );
    if (sentences.length) {
      sentences.forEach((s) => this.queueClause(turn, s));
      turn.spokenLen = speakable.length - rest.length;
    }
  }

  // ------------------------------------------------------------
  // Speaking
  // ------------------------------------------------------------

  /** Synthesis starts now, in parallel with whatever is playing. */
  private queueClause(turn: Turn, text: string): void {
    const clean = text.trim();
    if (!clean || turn.truncated) return;

    // Long enough: say where the rest is, and stop reading the answer.
    if (turn.clausesSpoken > 0 && turn.spokenChars + clean.length > this.o.maxSpokenChars) {
      turn.truncated = true;
      this.log("info", "Answer cut short for the phone", { turn: turn.id, spokenChars: turn.spokenChars });
      turn.chatAbort.abort();
      this.queueFixed(turn, this.phrases.fullSaved);
      return;
    }
    turn.spokenChars += clean.length;
    turn.clausesSpoken++;
    const t0 = this.o.now();
    const noteFirst = (provider: string) => {
      if (turn.metric.ttsFirstMs == null) {
        turn.metric.ttsFirstMs = this.o.now() - t0;
        turn.metric.ttsProvider = provider;
      }
    };

    if (this.o.speech.synthesizeStream) {
      // Spoken as it is generated, and started NOW so the next sentence is
      // being made while the current one plays.
      const stream = this.o.speech.synthesizeStream(clean, this.o.language, turn.abort.signal);
      turn.queue.push(Promise.resolve(buffered(stream.chunks, () => noteFirst(stream.meta.provider))));
    } else {
      turn.queue.push(
        this.o.speech
          .synthesize(clean, this.o.language)
          .then((r) => {
            noteFirst(r.provider);
            return once(r.mulaw);
          })
          .catch((err) => {
            this.log("error", "Speech synthesis failed", { error: String(err).slice(0, 140) });
            return null;
          })
      );
    }
    void this.pump(turn);
  }

  private queueFixed(turn: Turn, text: string): void {
    turn.clausesSpoken++;
    const make = this.o.speech.phrase ?? this.o.speech.synthesize;
    turn.queue.push(
      make
        .call(this.o.speech, text, this.o.language)
        .then((r: TtsResult) => once(r.mulaw))
        .catch((err: unknown) => {
          this.log("error", "Phrase synthesis failed", { error: String(err).slice(0, 140) });
          return null;
        })
    );
    void this.pump(turn);
  }

  private async pump(turn: Turn): Promise<void> {
    if (turn.pumping) return;
    turn.pumping = true;
    try {
      while (!turn.cancelled) {
        const next = turn.queue.shift();
        if (!next) break;
        const clip = await next;
        if (turn.cancelled) return;
        if (!clip) continue;

        // Frames go out as each chunk arrives, so the caller hears the start
        // of a sentence while the end of it is still being made.
        let remainder: Buffer = Buffer.alloc(0);
        let sentAny = false;
        try {
          for await (const chunk of clip.chunks) {
            if (turn.cancelled) return;
            if (turn.filler) {
              clearTimeout(turn.filler);
              turn.filler = null;
            }
            if (turn.firstAnswerAudioAt == null) {
              turn.firstAnswerAudioAt = this.o.now();
              turn.metric.firstAudioMs = turn.firstAnswerAudioAt - turn.endOfSpeechAt;
            }
            const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
            const whole = data.length - (data.length % FRAME_SAMPLES);
            remainder = data.subarray(whole);
            if (whole > 0) {
              this.sendFrames(data.subarray(0, whole));
              sentAny = true;
            }
          }
        } catch (err) {
          this.log("error", "Speech stream failed", { error: String(err).slice(0, 140) });
        }
        if (turn.cancelled) return;
        if (remainder.length) {
          // Pad the last partial frame with μ-law silence.
          this.sendFrames(Buffer.concat([remainder, Buffer.alloc(FRAME_SAMPLES - remainder.length, 0xff)]));
          sentAny = true;
        }
        if (sentAny) this.endClip();
      }
    } finally {
      turn.pumping = false;
    }
    if (!turn.cancelled && turn.streamDone && turn.queue.length === 0) this.finishTurn(turn);
  }

  /** Frames go out immediately; the line buffers and plays them in order. */
  private sendAudio(mulaw: Buffer): void {
    this.sendFrames(mulaw);
    this.endClip();
  }

  /** Whole frames to the line, sent at once. */
  private sendFrames(mulaw: Buffer): void {
    this.endpointer.setPlayback(true);
    for (const frame of toFrames(mulaw, FRAME_SAMPLES)) this.o.transport.sendFrame(frame);
    this.o.transport.flush?.();
  }

  /** Ask the line to tell us when everything sent so far has been heard. */
  private endClip(): void {
    const name = `m${++this.markCounter}`;
    this.marks.add(name);
    this.o.transport.mark(name);
  }

  private async playFiller(turn: Turn): Promise<void> {
    turn.filler = null;
    if (turn.cancelled || turn.firstAnswerAudioAt != null || this.stopped) return;
    const text = this.phrases.acks[turn.id % this.phrases.acks.length];
    const make = this.o.speech.phrase ?? this.o.speech.synthesize;
    try {
      const clip: TtsResult = await make.call(this.o.speech, text, this.o.language);
      // The answer may have started while the acknowledgement was being made.
      if (turn.cancelled || turn.firstAnswerAudioAt != null) return;
      turn.fillerPlayed = true;
      this.sendAudio(clip.mulaw);
    } catch {
      /* an acknowledgement is a nicety; silence is fine */
    }
  }

  /** A phrase that is not part of an AI turn (greeting, prompts). */
  private async speakFixed(text: string): Promise<void> {
    const make = this.o.speech.phrase ?? this.o.speech.synthesize;
    try {
      const clip = await make.call(this.o.speech, text, this.o.language);
      if (this.stopped) return;
      this.sendAudio(clip.mulaw);
    } catch (err) {
      this.log("error", "Could not speak a fixed phrase", { error: String(err).slice(0, 140) });
      this.maybeIdle();
    }
  }

  // ------------------------------------------------------------
  // Bookkeeping
  // ------------------------------------------------------------

  private finishTurn(turn: Turn): void {
    this.report(turn, false);
    if (this.turn === turn) this.turn = null;
    this.maybeIdle();
  }

  /** A turn that produced nothing (unintelligible audio): no record, no filler. */
  private dropTurn(turn: Turn): void {
    if (turn.filler) clearTimeout(turn.filler);
    turn.cancelled = true;
    turn.reported = true;
    if (this.turn === turn) this.turn = null;
  }

  private cancelTurn(turn: Turn, byCaller: boolean): void {
    if (turn.cancelled) return;
    turn.cancelled = true;
    turn.cancelledByCaller = byCaller;
    turn.abort.abort();
    turn.queue = [];
    if (turn.filler) clearTimeout(turn.filler);
    turn.wake?.();
    // They spoke again BEFORE the AI was asked: what they already said joins
    // the next utterance, so a pause mid-thought loses nothing and the AI
    // sees one whole sentence. (The transcript already includes any earlier
    // carried words.) Once the AI has been asked this does not apply.
    if (byCaller && !turn.committed && turn.transcript) {
      this.carryOver = turn.transcript;
    }
    this.report(turn, true);
    if (this.turn === turn) this.turn = null;
  }

  private report(turn: Turn, interrupted: boolean): void {
    if (turn.reported || turn.metric.sttMs == null) return;
    turn.reported = true;
    void this.o.events.turn({
      n: turn.id,
      firstAudioMs: turn.metric.firstAudioMs ?? null,
      sttMs: turn.metric.sttMs,
      llmFirstTokenMs: turn.metric.llmFirstTokenMs ?? null,
      ttsFirstMs: turn.metric.ttsFirstMs ?? null,
      sttProvider: turn.metric.sttProvider ?? "unknown",
      ttsProvider: turn.metric.ttsProvider ?? null,
      kind: turn.metric.kind ?? null,
      fillerPlayed: turn.fillerPlayed,
      interrupted,
    });
  }

  // ------------------------------------------------------------
  // Quiet, retries and hanging up
  // ------------------------------------------------------------

  private maybeIdle(): void {
    if (this.stopped || this.turn || this.marks.size > 0) return;
    this.endpointer.setPlayback(false);
    if (this.closeAfterPlayback) {
      this.o.transport.close();
      return;
    }
    this.armSilence();
  }

  private armSilence(): void {
    this.clearSilence();
    const wait = this.o.silenceMs[Math.min(this.silenceStage, 2)];
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.stopped || this.turn || this.marks.size > 0 || this.endpointer.isSpeaking) return;
      if (this.silenceStage >= 2) {
        void this.endCall(this.phrases.goodbye, this.heardCaller ? "silence" : "no-answer-speech");
        return;
      }
      this.silenceStage++;
      void this.speakFixed(this.phrases.silence);
    }, wait);
  }

  private clearSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private async sayRetryOrEnd(phrase: string): Promise<void> {
    if (++this.retries >= 3) {
      await this.endCall(this.phrases.goodbye, "unintelligible");
      return;
    }
    await this.speakFixed(phrase);
  }

  /** Say a last phrase, wait until it has been heard, then hang up. */
  private async endCall(phrase: string, reason: string): Promise<void> {
    if (this.stopped || this.closeAfterPlayback) return;
    this.clearSilence();
    if (this.turn) this.cancelTurn(this.turn, false);
    this.o.transport.clear();
    this.marks.clear();
    this.closeAfterPlayback = reason;
    this.log("info", "Ending call", { reason });
    // If the farewell cannot be spoken or its mark never returns, still hang up.
    this.closeSafety = setTimeout(() => this.o.transport.close(), 15_000);
    await this.speakFixed(phrase);
    if (this.marks.size === 0) this.o.transport.close();
  }

  /** Lets a test or the bridge know how long a clip will take to play. */
  static clipMs(mulaw: Buffer): number {
    return mulawDurationMs(mulaw);
  }
}
