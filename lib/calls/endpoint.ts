// ==========================================================
// LegalSetu — utterance endpointing for phone audio
// ----------------------------------------------------------
// Decides when the caller started and stopped speaking, from the
// loudness of each 20 ms frame. Driven by FRAME COUNT, not the wall
// clock, so behaviour is identical in a test and on a live call.
//
// Two things matter for a call that feels fast:
//  - HANGOVER: how long a pause counts as "finished". Every
//    millisecond here is added to every single reply, so it is
//    short; a longer pause mid-sentence is handled upstream by
//    merging the two halves rather than by waiting longer here.
//  - ADAPTIVE THRESHOLD: phone lines have a noise floor that varies
//    call to call. A fixed threshold either misses quiet callers or
//    treats hiss as speech and never ends the utterance.
// ==========================================================

import { FRAME_MS, rms } from "./audio";

export interface EndpointOptions {
  /** Consecutive loud frames that start an utterance. */
  startFrames: number;
  /** Quiet frames after speech that end it. */
  hangoverFrames: number;
  /** Loud frames an utterance needs in total to be worth transcribing. */
  minLoudFrames: number;
  /** Hard cap so an unending noise cannot grow the buffer forever. */
  maxUtteranceFrames: number;
  /** Audio kept from before the trigger, so the first syllable is not clipped. */
  prerollFrames: number;
  /** Absolute floor for the speech threshold (RMS 0..1). */
  minThreshold: number;
  /** Threshold = max(minThreshold, noiseFloor * thresholdFactor). */
  thresholdFactor: number;
}

export const DEFAULT_ENDPOINT: EndpointOptions = {
  startFrames: 3, // 60 ms
  hangoverFrames: 26, // 520 ms
  minLoudFrames: 8, // 160 ms of actual speech
  maxUtteranceFrames: 25 * (1000 / FRAME_MS), // 25 s
  prerollFrames: 12, // 240 ms
  minThreshold: 0.012,
  thresholdFactor: 2.8,
};

/** While the assistant is talking, only deliberate speech may interrupt it. */
export const PLAYBACK_OVERRIDES: Partial<EndpointOptions> = {
  startFrames: 10, // 200 ms of sustained speech
  minThreshold: 0.03,
  thresholdFactor: 4,
};

export type EndpointEvent =
  | { type: "speech-start"; atFrame: number }
  | { type: "utterance"; pcm: Buffer; loudFrames: number; durationMs: number; endedAtFrame: number }
  | { type: "discarded"; reason: "too-short" };

export class Endpointer {
  private opts: EndpointOptions;
  private mode: "normal" | "playback" = "normal";
  private frame = 0;
  private noiseFloor = 0.004;
  private loudRun = 0;
  private quietRun = 0;
  private speaking = false;
  private loudTotal = 0;
  private preroll: Buffer[] = [];
  private captured: Buffer[] = [];

  constructor(options: Partial<EndpointOptions> = {}) {
    this.opts = { ...DEFAULT_ENDPOINT, ...options };
  }

  /** Stricter detection while our own voice is playing down the line. */
  setPlayback(playing: boolean): void {
    this.mode = playing ? "playback" : "normal";
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get hangoverMs(): number {
    return this.opts.hangoverFrames * FRAME_MS;
  }

  /** Forgets any partial utterance (used when a turn is cancelled). */
  reset(): void {
    this.speaking = false;
    this.loudRun = 0;
    this.quietRun = 0;
    this.loudTotal = 0;
    this.captured = [];
    this.preroll = [];
  }

  private effective(): EndpointOptions {
    return this.mode === "playback" ? { ...this.opts, ...PLAYBACK_OVERRIDES } : this.opts;
  }

  /** Feed one 20 ms frame of 16-bit PCM. */
  push(pcmFrame: Buffer): EndpointEvent[] {
    const events: EndpointEvent[] = [];
    const o = this.effective();
    const level = rms(pcmFrame);
    const threshold = Math.max(o.minThreshold, this.noiseFloor * o.thresholdFactor);
    const loud = level > threshold;
    this.frame++;

    // Learn the noise floor from quiet frames only, so speech never raises it.
    if (!loud && !this.speaking) this.noiseFloor = this.noiseFloor * 0.97 + level * 0.03;

    if (!this.speaking) {
      this.preroll.push(pcmFrame);
      if (this.preroll.length > o.prerollFrames) this.preroll.shift();

      this.loudRun = loud ? this.loudRun + 1 : 0;
      if (this.loudRun >= o.startFrames) {
        this.speaking = true;
        this.quietRun = 0;
        this.loudTotal = this.loudRun;
        this.captured = [...this.preroll];
        this.preroll = [];
        events.push({ type: "speech-start", atFrame: this.frame });
      }
      return events;
    }

    this.captured.push(pcmFrame);
    if (loud) {
      this.loudTotal++;
      this.quietRun = 0;
    } else {
      this.quietRun++;
    }

    const ended = this.quietRun >= o.hangoverFrames;
    const capped = this.captured.length >= o.maxUtteranceFrames;
    if (ended || capped) {
      const loudFrames = this.loudTotal;
      const pcm = Buffer.concat(this.captured);
      // Trailing silence is trimmed to a short tail; it only adds STT time.
      const keepTail = 6 * (pcmFrame.length);
      const trimmed = ended && pcm.length > keepTail + this.opts.hangoverFrames * pcmFrame.length
        ? pcm.subarray(0, pcm.length - (this.opts.hangoverFrames * pcmFrame.length - keepTail))
        : pcm;
      this.reset();
      if (loudFrames < this.opts.minLoudFrames) {
        events.push({ type: "discarded", reason: "too-short" });
      } else {
        events.push({
          type: "utterance",
          pcm: trimmed,
          loudFrames,
          durationMs: (trimmed.length / 2 / 8000) * 1000,
          endedAtFrame: this.frame,
        });
      }
    }
    return events;
  }
}
