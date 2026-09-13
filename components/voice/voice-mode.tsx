"use client";

// ==========================================================
// LegalSetu — full-screen voice mode
// ----------------------------------------------------------
// Talk instead of type. The loop is:
//
//   mic -> voice-activity detection -> Sarvam STT
//       -> the SAME /api/chat/stream pipeline the typed chat uses
//       -> sentences piped to Sarvam Bulbul as they finish
//       -> played back to back while the answer is still generating
//
// Two things make it feel live rather than walkie-talkie:
//   * the answer is spoken sentence by sentence, so audio starts
//     within a sentence of generation rather than after the whole
//     reply is written;
//   * the microphone keeps listening while the assistant talks, so
//     speaking over it cuts the audio instantly and starts a new
//     question (barge-in).
//
// Every Sarvam call goes through /api/voice/*, so the subscription
// key stays on the server. Nothing here knows it exists.
// ==========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Loader2, AudioLines, AlertTriangle, Volume2 } from "lucide-react";
import type { ChatMode } from "@/lib/rag/prompt";
import { extractClauses, extractSentences, toSpeakable } from "@/lib/voice/speech-text";

type Phase = "starting" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

interface VoiceModeProps {
  open: boolean;
  onClose: () => void;
  /** Interface language — the preferred voice for the reply. */
  language: string;
  /** Reuses whichever chat mode the user already had selected. */
  mode: ChatMode;
  modelId: string;
  conversationId: string | null;
  /** Lets the parent add the spoken turn to the visible transcript. */
  onTurn: (userText: string, assistantText: string, conversationId?: string) => void;
}

/** RMS above this counts as speech while the assistant is quiet. */
const SPEECH_THRESHOLD = 0.035;
/**
 * Higher bar while audio is playing. Echo cancellation removes most of
 * the assistant's own voice, but not all of it on every device, and a
 * false barge-in mid-answer is worse than a slightly firmer interruption.
 * Lowered from 0.1 to 0.08 for easier, more natural interruption.
 */
const BARGE_THRESHOLD = 0.08;
/**
 * Silence this long after speech ends the utterance. Every millisecond
 * here is dead air the user waits through before anything starts, so it
 * is kept just long enough to ride out a pause mid-sentence.
 * Reduced from 650ms to 400ms — ChatGPT-class responsiveness.
 */
const SILENCE_MS = 400;
/** Restart the recorder after this much unbroken silence, to keep blobs small. */
const IDLE_RESET_MS = 8_000;
/** Ignore blips shorter than this so a cough is not a question. */
const MIN_SPEECH_MS = 200;

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function VoiceMode({
  open,
  onClose,
  language,
  mode,
  modelId,
  conversationId,
  onTurn,
}: VoiceModeProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [userText, setUserText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** History of previous voice turns for the mini-transcript. */
  const [turns, setTurns] = useState<{ user: string; assistant: string }[]>([]);

  // --- media plumbing ---
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);

  // --- vad bookkeeping ---
  const heardSpeechRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const segmentStartedAtRef = useRef(0);
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>("starting");
  const closingRef = useRef(false);

  // --- speech output (dual audio ping-pong for gapless playback) ---
  const audioElARef = useRef<HTMLAudioElement | null>(null);
  const audioElBRef = useRef<HTMLAudioElement | null>(null);
  /** Which audio element is currently active: 0 = A, 1 = B. */
  const audioIdxRef = useRef(0);
  const ttsQueueRef = useRef<string[]>([]);
  const pumpingRef = useRef(false);
  const cancelSpeechRef = useRef(false);
  const streamDoneRef = useRef(true);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const ttsBlockedRef = useRef(false);

  // --- chat stream ---
  const chatAbortRef = useRef<AbortController | null>(null);
  const spokenTailRef = useRef("");

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  mutedRef.current = muted;

  // ---------------------------------------------------------------
  // Speech output
  // ---------------------------------------------------------------
  const releaseUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const synth = useCallback(
    async (text: string): Promise<string | null> => {
      if (ttsBlockedRef.current) return null;
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ text, language }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          if (detail?.error?.code === "TTS_LANGUAGE_UNSUPPORTED") {
            // No voice exists for this script. Stop trying for the rest
            // of the session and let the on-screen transcript carry it.
            ttsBlockedRef.current = true;
            setNotice(detail.error.message);
          } else if (res.status === 429) {
            setNotice("Speech is rate-limited for a moment — the answer is still on screen.");
          }
          return null;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        return url;
      } catch {
        return null;
      }
    },
    [language]
  );

  /** Plays a URL on the next audio element in the ping-pong pair. */
  const playUrl = useCallback((url: string) => {
    return new Promise<void>((resolve) => {
      // Alternate between A and B for gapless playback.
      const el = audioIdxRef.current === 0 ? audioElARef.current : audioElBRef.current;
      audioIdxRef.current = audioIdxRef.current === 0 ? 1 : 0;
      if (!el) return resolve();
      const finish = () => {
        el.removeEventListener("ended", finish);
        el.removeEventListener("error", finish);
        resolve();
      };
      el.addEventListener("ended", finish);
      el.addEventListener("error", finish);
      el.src = url;
      el.play().catch((err) => {
        console.warn("Audio play failed:", err);
        finish();
      });
    });
  }, []);

  /**
   * Drains the clause/sentence queue with 2-deep lookahead: while the
   * current clip plays, the next TWO clips are already being synthesised.
   * Combined with the dual-audio ping-pong, this eliminates perceptible
   * gaps between spoken phrases entirely.
   */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    try {
      let ahead1: Promise<string | null> | null = null;
      let ahead2: Promise<string | null> | null = null;

      while (!cancelSpeechRef.current) {
        // Rotate the lookahead pipeline forward.
        let urlPromise = ahead1;
        ahead1 = ahead2;
        ahead2 = null;

        if (!urlPromise) {
          const next = ttsQueueRef.current.shift();
          if (!next) break;
          urlPromise = synth(next);
        }

        // Fill any empty lookahead slots from the queue.
        if (!ahead1) {
          const s1 = ttsQueueRef.current.shift();
          if (s1) ahead1 = synth(s1);
        }
        if (!ahead2) {
          const s2 = ttsQueueRef.current.shift();
          if (s2) ahead2 = synth(s2);
        }

        const url = await urlPromise;
        if (cancelSpeechRef.current) break;
        if (url) {
          if (phaseRef.current !== "speaking") setPhaseSafe("speaking");
          await playUrl(url);
        }
      }
    } finally {
      pumpingRef.current = false;
      // Back to listening only once generation has finished too —
      // otherwise the queue is merely empty for the moment.
      if (!cancelSpeechRef.current && streamDoneRef.current && ttsQueueRef.current.length === 0) {
        if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
          setPhaseSafe("listening");
        }
      }
    }
  }, [playUrl, setPhaseSafe, synth]);

  const enqueueSpeech = useCallback(
    (sentence: string) => {
      const clean = sentence.trim();
      if (!clean) return;
      ttsQueueRef.current.push(clean);
      void pump();
    },
    [pump]
  );

  const cancelSpeech = useCallback(() => {
    cancelSpeechRef.current = true;
    ttsQueueRef.current = [];
    ttsAbortRef.current?.abort();
    // Stop both audio elements in the ping-pong pair.
    for (const el of [audioElARef.current, audioElBRef.current]) {
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    }
    releaseUrls();
  }, [releaseUrls]);

  // ---------------------------------------------------------------
  // One turn through the existing chat pipeline
  // ---------------------------------------------------------------
  const runVoiceTurn = useCallback(
    async (question: string) => {
      setPhaseSafe("thinking");
      setAnswerText("");
      spokenTailRef.current = "";
      streamDoneRef.current = false;
      cancelSpeechRef.current = false;

      const controller = new AbortController();
      chatAbortRef.current = controller;

      let answer = "";
      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            content: question,
            language,
            mode,
            modelId,
            // Same pipeline and same grounding — just a reply short
            // enough to listen to.
            voice: true,
            ...(conversationId ? { conversationId } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error?.message ?? "The assistant could not be reached.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let newConversationId: string | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const lines = frame.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(6).trim();
            let payload: any;
            try {
              payload = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }

            if (event === "token") {
              answer += payload.delta ?? "";
              setAnswerText(answer);

              // Speak at clause boundaries (commas, semicolons) not just
              // sentence ends — gets audio to the speaker ~500ms sooner.
              const speakable = toSpeakable(answer);
              if (speakable.length > spokenTailRef.current.length) {
                const fresh = speakable.slice(spokenTailRef.current.length);
                const { sentences, rest } = extractClauses(fresh);
                if (sentences.length) {
                  sentences.forEach(enqueueSpeech);
                  spokenTailRef.current = speakable.slice(0, speakable.length - rest.length);
                }
              }
            } else if (event === "done") {
              newConversationId = payload.conversationId;
            } else if (event === "error") {
              throw new Error(payload.message ?? "The assistant hit an error.");
            }
          }
        }

        // Anything left without a closing full stop still gets spoken.
        const finalSpeakable = toSpeakable(answer);
        const leftover = finalSpeakable.slice(spokenTailRef.current.length).trim();
        if (leftover) enqueueSpeech(leftover);

        // Track in conversation history for the mini-transcript.
        setTurns((prev) => [...prev, { user: question, assistant: answer }]);
        onTurn(question, answer, newConversationId);
      } catch (err: any) {
        if (err?.name === "AbortError") return; // barge-in or closing
        setErrorMessage(err?.message ?? "Something went wrong.");
        setPhaseSafe("error");
        return;
      } finally {
        streamDoneRef.current = true;
      }

      // If nothing was queued (empty answer, or TTS unavailable) return
      // to listening rather than sitting on "thinking" forever.
      if (!pumpingRef.current && ttsQueueRef.current.length === 0) {
        setPhaseSafe("listening");
      } else {
        void pump();
      }
    },
    [conversationId, enqueueSpeech, language, mode, onTurn, pump, setPhaseSafe]
  );

  // ---------------------------------------------------------------
  // Utterance -> transcript
  // ---------------------------------------------------------------
  const handleUtterance = useCallback(
    async (blob: Blob) => {
      if (closingRef.current) return;
      setPhaseSafe("transcribing");

      try {
        const form = new FormData();
        form.append("audio", blob, "utterance.webm");
        const res = await fetch("/api/voice/stt", { method: "POST", body: form });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const message = json?.error?.message ?? "Could not transcribe that.";
          if (res.status === 503) {
            setErrorMessage(message);
            setPhaseSafe("error");
            return;
          }
          setNotice(message);
          setPhaseSafe("listening");
          return;
        }

        const transcript: string = (json?.data?.transcript ?? "").trim();
        if (!transcript) {
          setNotice("I didn't catch that — please say it again.");
          setPhaseSafe("listening");
          return;
        }

        setNotice(null);
        setUserText(transcript);
        await runVoiceTurn(transcript);
      } catch {
        setNotice("Network problem while sending your question.");
        setPhaseSafe("listening");
      }
    },
    [runVoiceTurn, setPhaseSafe]
  );

  // ---------------------------------------------------------------
  // Recording segments
  // ---------------------------------------------------------------
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || closingRef.current) return;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      setErrorMessage("This browser cannot record audio. Try Chrome or Edge.");
      setPhaseSafe("error");
      return;
    }

    chunksRef.current = [];
    heardSpeechRef.current = false;
    segmentStartedAtRef.current = performance.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    // Record in 1-second slices so chunks accumulate continuously.
    // When speech ends, the blob is already mostly built — only the
    // last sub-second chunk needs appending, cutting packaging time.
    recorder.start(1000);
    recorderRef.current = recorder;
  }, [setPhaseSafe]);

  /** Stops the current segment; sends it on only if speech was heard. */
  const finishSegment = useCallback(
    (send: boolean) => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder || recorder.state === "inactive") return;

      const spokeLongEnough =
        heardSpeechRef.current &&
        performance.now() - speechStartedAtRef.current >= MIN_SPEECH_MS;
      const type = recorder.mimeType || "audio/webm";

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (send && spokeLongEnough && !closingRef.current) {
          void handleUtterance(blob);
        }
        // Always restart the mic immediately — keep it hot at all times
        // so the next utterance or barge-in is captured without delay.
        if (!closingRef.current) startSegment();
      };

      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    },
    [handleUtterance, startSegment]
  );

  // ---------------------------------------------------------------
  // Voice activity detection
  // ---------------------------------------------------------------
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || closingRef.current) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);

    setLevel((prev) => prev * 0.7 + Math.min(1, rms * 6) * 0.3);

    const now = performance.now();
    const current = phaseRef.current;
    const listening = current === "listening" || current === "speaking";

    if (!mutedRef.current && listening) {
      const threshold = current === "speaking" ? BARGE_THRESHOLD : SPEECH_THRESHOLD;

      if (rms > threshold) {
        if (!heardSpeechRef.current) {
          heardSpeechRef.current = true;
          speechStartedAtRef.current = now;
        }
        lastVoiceAtRef.current = now;

        // Barge-in: talking over the assistant cancels it immediately.
        if (current === "speaking") {
          cancelSpeech();
          chatAbortRef.current?.abort();
          streamDoneRef.current = true;
          setPhaseSafe("listening");
        }
      } else if (heardSpeechRef.current && now - lastVoiceAtRef.current > SILENCE_MS) {
        finishSegment(true);
      } else if (!heardSpeechRef.current && now - segmentStartedAtRef.current > IDLE_RESET_MS) {
        // Nothing said for a while — recycle the recorder so we are not
        // accumulating minutes of silence in memory.
        finishSegment(false);
        startSegment();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [cancelSpeech, finishSegment, setPhaseSafe, startSegment]);

  // ---------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------
  const teardown = useCallback(() => {
    closingRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    chatAbortRef.current?.abort();
    ttsAbortRef.current?.abort();
    ttsQueueRef.current = [];
    cancelSpeechRef.current = true;

    // Stop both audio elements in the ping-pong pair.
    for (const el of [audioElARef.current, audioElBRef.current]) {
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    }
    releaseUrls();

    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, [releaseUrls]);

  useEffect(() => {
    if (!open) return;

    closingRef.current = false;
    cancelSpeechRef.current = false;
    streamDoneRef.current = true;
    ttsBlockedRef.current = false;
    audioIdxRef.current = 0;
    setErrorMessage(null);
    setNotice(null);
    setUserText("");
    setAnswerText("");
    setTurns([]);
    setPhaseSafe("starting");

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const Ctor: typeof AudioContext =
          window.AudioContext ?? (window as any).webkitAudioContext;
        const ctx = new Ctor();
        await ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        setPhaseSafe("listening");
        lastVoiceAtRef.current = performance.now();
        startSegment();
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: any) {
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        setErrorMessage(
          denied
            ? "Microphone access was blocked. Allow it in your browser's address bar, then try again."
            : err?.name === "NotFoundError"
              ? "No microphone was found on this device."
              : "Could not start the microphone."
        );
        setPhaseSafe("error");
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // Intentionally keyed on `open` alone. The helpers below are
    // recreated whenever the parent re-renders, and listing them here
    // would tear the microphone down and back up mid-conversation.
  }, [open]);

  // Esc closes, M toggles the mic — the two controls worth a shortcut.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const statusLabel =
    phase === "starting"
      ? "Starting microphone…"
      : phase === "listening"
        ? muted ? "Microphone muted" : "I'm listening…"
        : phase === "transcribing"
          ? "Thinking…"
          : phase === "thinking"
            ? "Thinking…"
            : phase === "speaking"
              ? "Speaking… (interrupt anytime)"
              : "Voice mode stopped";

  const orbScale = 1 + (phase === "listening" && !muted ? level * 0.45 : phase === "speaking" ? 0.15 : 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice conversation with LegalSetu"
      className="fixed inset-0 z-[120] flex flex-col bg-gradient-to-b from-slate-950 via-[#0B1120] to-slate-950"
    >
      {/* Dual audio elements for gapless ping-pong playback */}
      <audio ref={audioElARef} preload="auto" />
      <audio ref={audioElBRef} preload="auto" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandBlue/15 text-brandBlue">
            <AudioLines className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Voice mode</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              {mode === "case"
                ? "Case analysis"
                : mode === "quick"
                  ? "Quick answer"
                  : mode === "fir"
                    ? "Generate FIR"
                    : "Know the law"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="End voice mode"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-4">
        {phase === "error" ? (
          <div className="max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-white">Voice mode can&apos;t run</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{errorMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Back to typing
            </button>
          </div>
        ) : (
          <>
            {/* Orb */}
            <div className="relative flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
              <span
                className={
                  "absolute inset-0 rounded-full blur-2xl transition-opacity duration-500 " +
                  (phase === "speaking"
                    ? "bg-emerald-500/25 opacity-100"
                    : phase === "thinking" || phase === "transcribing"
                      ? "bg-amber-500/20 opacity-100"
                      : muted
                        ? "bg-slate-500/20 opacity-70"
                        : "bg-brandBlue/30 opacity-100")
                }
              />
              {(phase === "listening" && !muted) || phase === "speaking" ? (
                <>
                  <span className="absolute inset-6 animate-ping rounded-full border border-white/10" />
                  <span className="absolute inset-10 animate-pulse rounded-full border border-white/10" />
                </>
              ) : null}

              <div
                style={{ transform: `scale(${orbScale.toFixed(3)})` }}
                className={
                  "relative flex h-32 w-32 items-center justify-center rounded-full shadow-2xl transition-transform duration-[60ms] sm:h-36 sm:w-36 " +
                  (phase === "speaking"
                    ? "bg-gradient-to-br from-emerald-400 to-teal-600"
                    : phase === "thinking" || phase === "transcribing"
                      ? "bg-gradient-to-br from-amber-400 to-orange-600"
                      : muted
                        ? "bg-gradient-to-br from-slate-600 to-slate-800"
                        : "bg-gradient-to-br from-blue-400 to-indigo-700")
                }
              >
                {phase === "thinking" || phase === "transcribing" || phase === "starting" ? (
                  <Loader2 className="h-9 w-9 animate-spin text-white" />
                ) : phase === "speaking" ? (
                  <Volume2 className="h-9 w-9 text-white" />
                ) : muted ? (
                  <MicOff className="h-9 w-9 text-white" />
                ) : (
                  <Mic className="h-9 w-9 text-white" />
                )}
              </div>
            </div>

            {/* Status + live transcript */}
            <div className="w-full max-w-2xl text-center" aria-live="polite" aria-atomic="false">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                {statusLabel}
              </p>

              {notice && (
                <p className="mx-auto mt-3 max-w-md rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {notice}
                </p>
              )}

              {/* Previous turns — scrollable mini-transcript */}
              {turns.length > 0 && (
                <div className="mt-4 max-h-[18vh] space-y-2 overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
                  {turns.map((t, i) => (
                    <div key={i} className="text-left text-xs">
                      <p className="text-slate-500"><span className="font-semibold text-slate-400">You:</span> {t.user}</p>
                      <p className="mt-0.5 text-slate-500"><span className="font-semibold text-brandBlue/70">LegalSetu:</span> {t.assistant.slice(0, 120)}{t.assistant.length > 120 ? "…" : ""}</p>
                    </div>
                  ))}
                </div>
              )}

              {userText && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">You said</p>
                  <p className="mt-1 text-base leading-relaxed text-white" data-no-translate>
                    {userText}
                  </p>
                </div>
              )}

              {answerText && (
                <div className="mt-3 max-h-[32vh] overflow-y-auto rounded-2xl border border-brandBlue/20 bg-brandBlue/5 px-5 py-3 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brandBlue">LegalSetu</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {answerText}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      {phase !== "error" && (
        <div className="flex items-center justify-center gap-4 px-6 pb-10 pt-2">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            className={
              "flex h-14 w-14 items-center justify-center rounded-full border transition-all hover:scale-105 " +
              (muted
                ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                : "border-white/15 bg-white/5 text-white hover:bg-white/10")
            }
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="End voice mode"
            className="flex h-16 items-center gap-2.5 rounded-full bg-rose-600 px-8 text-base font-bold text-white shadow-lg shadow-rose-600/25 transition-all hover:scale-105 hover:bg-rose-500"
          >
            <X className="h-5 w-5" />
            End
          </button>

          {phase === "speaking" && (
            <button
              type="button"
              onClick={() => {
                cancelSpeech();
                cancelSpeechRef.current = false;
                setPhaseSafe("listening");
              }}
              aria-label="Stop speaking"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-all hover:scale-105 hover:bg-white/10"
            >
              <Volume2 className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
