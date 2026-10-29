"use client";

// ==========================================================
// LegalSetu — Real-Time Bidirectional Voice Mode
// ----------------------------------------------------------
// One continuous loop:
//   speak -> VAD detects the pause -> Sarvam transcribes
//     -> /api/chat/stream answers -> each clause is spoken as
//     it is written -> back to listening.
//
// Input: microphone RMS drives a voice-activity detector; the
// finished utterance is POSTed to /api/voice/stt, which calls
// Sarvam Saaras server-side. Sarvam AUTO-DETECTS which of ~22
// Indian languages was spoken, so someone browsing in English
// can ask their question in Tamil and be understood.
//
// Output: Sarvam Bulbul, one clause at a time, synthesised
// ahead of playback so speech starts while the answer is still
// being generated.
//
// ----------------------------------------------------------
// Why the browser's Web Speech API is NOT used here
// ----------------------------------------------------------
// It was, and it was the reason voice mode appeared to hang.
// Three faults compounded:
//
//  1. The server-side fallback was unreachable. It ran under
//     `if (!speechSupportedRef.current)`, but every Chromium
//     browser defines webkitSpeechRecognition, so that branch
//     was dead code. When recognition produced nothing — which
//     it routinely does for Indian languages — the recorder
//     kept running and NOTHING was ever sent. The UI sat in
//     "Listening" indefinitely.
//
//  2. It listened in the wrong language. recognition.lang came
//     from the INTERFACE language, so an English UI meant an
//     en-IN recogniser trying to parse Hindi.
//
//  3. It does not exist in Firefox, and is unreliable in Safari.
//
// Sarvam handles all three: one path, every browser, language
// detected from the audio instead of assumed from a setting.
// ==========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Loader2, AudioLines, AlertTriangle, Volume2 } from "lucide-react";
import type { ChatMode } from "@/lib/rag/prompt";
import { extractClauses, toSpeakable } from "@/lib/voice/speech-text";
import { getLanguage, speechCodeFor, normalizeLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n/languages";
import { appLanguageFromSarvam } from "@/lib/i18n/sarvam-translate";

type Phase = "starting" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

interface VoiceModeProps {
  open: boolean;
  onClose: () => void;
  /** Interface language — the fallback voice when nothing is detected. */
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
 * Higher bar while audio is playing, so the assistant's own voice
 * coming back through the speakers cannot interrupt it. Only deliberate,
 * close-mic speech clears this.
 */
const BARGE_THRESHOLD = 0.22;
/** Silence after speech that ends the utterance. */
const SILENCE_MS = 700;
/** Restart an idle recorder periodically so its buffer cannot grow forever. */
const IDLE_RESET_MS = 8_000;
/** Ignore blips shorter than this: clicks, coughs, a chair moving. */
const MIN_SPEECH_MS = 350;
/**
 * Force the utterance to end after this long, even if the speaker has
 * not paused.
 *
 * Sarvam rejects anything over 30 seconds outright:
 *   "Audio duration exceeds the maximum limit of 30 seconds."
 * Without a cap the detector simply waits for a silence that may never
 * come — someone speaking continuously, a television in the room, a
 * fan near the microphone — and the whole clip is then thrown away with
 * a 400. Cutting at 20s leaves headroom and turns "voice mode died" into
 * "it answered the first twenty seconds", which is recoverable.
 */
const MAX_UTTERANCE_MS = 20_000;
/**
 * Hard ceiling on the RECORDED clip, measured from when the recorder
 * started, not from when speech began. The clip includes any lead-in
 * silence before the user spoke (up to IDLE_RESET_MS), so a cap measured
 * from speech start alone could still produce a 28s+ file and hit
 * Sarvam's 30s limit.
 */
const MAX_SEGMENT_MS = 25_000;
/**
 * Ignore microphone energy for this long after playback starts. Echo
 * cancellation needs a moment to adapt, and without the grace period the
 * first word the assistant speaks barges in on itself.
 */
const ECHO_GRACE_MS = 1_200;

/**
 * Clause length, in characters, for the FIRST thing said in a reply.
 * Deliberately shorter than the default: the opening clause is the only
 * one whose synthesis the listener waits on in silence, so it is worth
 * splitting early even if it sounds slightly clipped. Every later clause
 * is synthesised while the previous one plays, so length is free there.
 */
const FIRST_CLAUSE_CHARS = 24;
/** Longest the first clip may grow before it is cut at a word break. */
const FIRST_CLAUSE_MAX_CHARS = 60;

/**
 * Client-side ceiling for one synthesis request.
 *
 * This was 4s while lib/voice/sarvam.ts allowed the server 12s, so the
 * client routinely gave up on a request the server was still completing,
 * fell through to browser speech synthesis, and — on a machine with no
 * Hindi voice installed — played nothing at all. Silence that the code
 * counted as success. The two timeouts now agree, and the browser is
 * only asked to speak when it actually has a voice for the language.
 */
const TTS_TIMEOUT_MS = 12_000;

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** True when the browser actually has a voice that can read this language. */
function hasBrowserVoiceFor(appLanguage: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return false;
  const tag = speechCodeFor(appLanguage);
  const base = tag.split("-")[0];
  return voices.some((v) => v.lang === tag || v.lang?.startsWith(base));
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
  /** Language Sarvam heard, shown so the user can see they were understood. */
  const [heardLanguage, setHeardLanguage] = useState<string | null>(null);
  const [turns, setTurns] = useState<{ user: string; assistant: string }[]>([]);

  // --- media plumbing ---
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const vadBufferRef = useRef<Float32Array | null>(null);

  // --- vad bookkeeping ---
  const heardSpeechRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const segmentStartedAtRef = useRef(0);
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>("starting");
  const closingRef = useRef(false);
  const speakingStartedAtRef = useRef(0);
  /** Gates the detector without tearing the recorder down. */
  const listeningRef = useRef(true);
  /** True between recorder.stop() and its onstop firing. */
  const stoppingRef = useRef(false);
  /**
   * Discards whatever the recorder holds and starts a clean clip. Set
   * once the segment helpers below exist; resumeListening calls it.
   */
  const restartSegmentRef = useRef<() => void>(() => {});

  /**
   * The language Sarvam detected on the last utterance. Replies are
   * spoken in the language the user actually spoke, not the one the
   * interface happens to be set to.
   */
  const detectedLanguageRef = useRef<string | null>(null);

  // --- speech output ---
  const audioElARef = useRef<HTMLAudioElement | null>(null);
  const audioElBRef = useRef<HTMLAudioElement | null>(null);
  const audioIdxRef = useRef(0);
  /**
   * Clips in playback order. `audio` is the in-flight synthesis promise,
   * started the moment the clause was extracted — so clause N+1 is being
   * synthesised while clause N is still playing, instead of after it.
   */
  const clipsRef = useRef<{ text: string; audio: Promise<string | null> }[]>([]);
  const pumpingRef = useRef(false);
  const cancelSpeechRef = useRef(false);
  const streamDoneRef = useRef(true);
  /** Every in-flight synthesis, so a barge-in can abort all of them. */
  const ttsAbortsRef = useRef<Set<AbortController>>(new Set());
  const objectUrlsRef = useRef<string[]>([]);
  const ttsBlockedRef = useRef(false);
  const warnedNoVoiceRef = useRef(false);

  // --- chat stream ---
  const chatAbortRef = useRef<AbortController | null>(null);
  const spokenTailRef = useRef("");

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  mutedRef.current = muted;

  /**
   * The language to answer and speak in. A language the user CHOSE from
   * the dropdown always wins — previously the detected language did, so
   * someone who selected Hindi and said "Hello AI" was answered in
   * English. Only on the default (English) setting, i.e. when no choice
   * was made, does the reply follow whatever language was spoken.
   */
  const replyLanguage = useCallback(
    () =>
      normalizeLanguage(language) !== DEFAULT_LANGUAGE
        ? language
        : (detectedLanguageRef.current ?? language),
    [language]
  );

  // ---------------------------------------------------------------
  // Listening gate. Replaces the old pause/resumeRecognition pair:
  // there is no recogniser to start and stop any more, only a flag
  // the detector consults.
  // ---------------------------------------------------------------
  const pauseListening = useCallback(() => {
    listeningRef.current = false;
    heardSpeechRef.current = false;
  }, []);

  const resumeListening = useCallback(() => {
    if (closingRef.current || mutedRef.current) return;
    heardSpeechRef.current = false;
    segmentStartedAtRef.current = performance.now();
    lastVoiceAtRef.current = performance.now();
    listeningRef.current = true;
    // THE root cause of voice mode going dead after the first answer: the
    // recorder kept running through transcription, thinking and the
    // assistant's own spoken reply, so the next question was sent as one
    // long clip — often past Sarvam's 30s limit (rejected with a 400, so
    // nothing was heard or answered) and always containing the
    // assistant's voice. Every listening turn now starts a fresh clip.
    restartSegmentRef.current();
  }, []);

  // ---------------------------------------------------------------
  // Browser audio unlocking (Chrome/Edge autoplay policy)
  // ---------------------------------------------------------------
  const unlockAudioPlayback = useCallback(() => {
    try {
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      const silentWav =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      // Only idle elements: this runs on EVERY tap on the overlay, and
      // swapping the source of the element currently playing a reply cut
      // that sentence off mid-word.
      for (const el of [audioElARef.current, audioElBRef.current]) {
        if (el && (el.paused || el.ended) && phaseRef.current !== "speaking") {
          el.src = silentWav;
          el.play().catch(() => {});
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
      }
    } catch {
      // Non-fatal.
    }
  }, []);

  // ---------------------------------------------------------------
  // Speech output
  // ---------------------------------------------------------------
  const releaseUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  /**
   * Last-resort local synthesis. Only attempted when the browser really
   * has a voice for the language: asking it to speak Hindi on a machine
   * with no Hindi voice produces silence AND fires no error, which is
   * indistinguishable from success and is exactly how voice mode used to
   * "work" while saying nothing.
   */
  const browserSpeak = useCallback(
    (text: string, appLanguage: string): Promise<void> => {
      return new Promise((resolve) => {
        const trimmed = text.trim();
        if (!trimmed) return resolve();

        if (!hasBrowserVoiceFor(appLanguage)) {
          if (!warnedNoVoiceRef.current) {
            warnedNoVoiceRef.current = true;
            setNotice(
              `Speech for ${getLanguage(appLanguage).nativeName} is unavailable right now — the reply is shown as text below.`
            );
          }
          return resolve();
        }

        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(trimmed);
          const speechLang = speechCodeFor(appLanguage);
          utterance.lang = speechLang;

          const voices = window.speechSynthesis.getVoices();
          const base = speechLang.split("-")[0];
          utterance.voice =
            voices.find((v) => v.lang === speechLang) ??
            voices.find((v) => v.lang?.startsWith(base)) ??
            null;

          utterance.rate = 1.05;
          utterance.pitch = 1.0;

          let finished = false;
          const done = () => {
            if (!finished) {
              finished = true;
              resolve();
            }
          };
          utterance.onend = done;
          utterance.onerror = done;
          // Guard against a stalled synthesiser.
          setTimeout(done, Math.max(1500, trimmed.length * 100));

          window.speechSynthesis.speak(utterance);
        } catch {
          resolve();
        }
      });
    },
    []
  );

  /** Synthesises one clause through Sarvam. Returns an object URL, or null. */
  const synth = useCallback(
    async (text: string, appLanguage: string): Promise<string | null> => {
      if (ttsBlockedRef.current) return null;

      const controller = new AbortController();
      ttsAbortsRef.current.add(controller);
      const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ text, language: appLanguage }),
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          // No Sarvam voice can read this script (Urdu, for one). Stop
          // asking for the rest of this answer.
          if (detail?.error?.code === "TTS_LANGUAGE_UNSUPPORTED") {
            ttsBlockedRef.current = true;
          }
          return null;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        return url;
      } catch {
        return null;
      } finally {
        clearTimeout(timeoutId);
        ttsAbortsRef.current.delete(controller);
      }
    },
    []
  );

  /**
   * Plays a URL on the next element of the ping-pong pair. Resolves true
   * once it has actually played, false if the browser refused or the clip
   * was unplayable — the caller then speaks the clause another way. This
   * used to resolve the same in both cases, so a blocked autoplay meant
   * the whole reply was silently skipped: "the assistant doesn't speak".
   */
  const playUrl = useCallback((url: string) => {
    return new Promise<boolean>((resolve) => {
      const el = audioIdxRef.current === 0 ? audioElARef.current : audioElBRef.current;
      audioIdxRef.current = audioIdxRef.current === 0 ? 1 : 0;
      if (!el) return resolve(false);

      let finished = false;
      let started = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
        el.removeEventListener("loadedmetadata", onMeta);
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(started);
      // If "ended" never arrives (a stalled decoder, a device change),
      // the conversation must not hang in "Speaking" forever.
      const onMeta = () => {
        const seconds = Number.isFinite(el.duration) ? el.duration : 20;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => finish(true), seconds * 1000 + 1500);
      };

      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      el.addEventListener("loadedmetadata", onMeta);
      watchdog = setTimeout(() => finish(started), 30_000);
      el.src = url;
      el.play()
        .then(() => {
          started = true;
        })
        .catch(() => {
          setNotice("Tap anywhere on this screen to turn on the assistant's voice.");
          finish(false);
        });
    });
  }, []);

  /** Plays queued clips in order, awaiting each one's pending synthesis. */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    try {
      while (!cancelSpeechRef.current) {
        const clip = clipsRef.current.shift();
        if (!clip) break;

        if (phaseRef.current !== "speaking") {
          setPhaseSafe("speaking");
          speakingStartedAtRef.current = performance.now();
        }

        const url = await clip.audio;
        if (cancelSpeechRef.current) break;

        const played = url ? await playUrl(url) : false;
        if (!played && !cancelSpeechRef.current) await browserSpeak(clip.text, replyLanguage());
      }
    } finally {
      pumpingRef.current = false;
      // Generation finished and nothing left to say: listen again.
      if (!cancelSpeechRef.current && streamDoneRef.current && clipsRef.current.length === 0) {
        setPhaseSafe("listening");
        resumeListening();
      }
    }
  }, [browserSpeak, playUrl, replyLanguage, resumeListening, setPhaseSafe]);

  /**
   * Queues one clause. Synthesis starts immediately rather than when the
   * clause reaches the front of the queue, so the network round-trip for
   * the next clause overlaps the playback of the current one.
   */
  const enqueueSpeech = useCallback(
    (sentence: string) => {
      const clean = sentence.trim();
      if (!clean) return;
      clipsRef.current.push({ text: clean, audio: synth(clean, replyLanguage()) });
      void pump();
    },
    [pump, replyLanguage, synth]
  );

  const cancelSpeech = useCallback(() => {
    cancelSpeechRef.current = true;
    clipsRef.current = [];

    for (const controller of ttsAbortsRef.current) controller.abort();
    ttsAbortsRef.current.clear();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safari throws if synthesis was never started. Nothing to undo.
      }
    }

    for (const el of [audioElARef.current, audioElBRef.current]) {
      if (el) {
        el.pause();
        el.removeAttribute("src");
        try {
          el.load();
        } catch {
          // Resetting a never-loaded element is not an error worth raising.
        }
      }
    }
    releaseUrls();
  }, [releaseUrls]);

  // ---------------------------------------------------------------
  // One conversational turn
  // ---------------------------------------------------------------
  const runVoiceTurn = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) {
        setPhaseSafe("listening");
        resumeListening();
        return;
      }

      pauseListening();
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
            content: trimmed,
            // Answer in the language that was spoken.
            language: replyLanguage(),
            mode,
            modelId,
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

              // Speak each clause as soon as it is complete.
              const speakable = toSpeakable(answer);
              if (speakable.length > spokenTailRef.current.length) {
                const fresh = speakable.slice(spokenTailRef.current.length);
                const isFirst = clipsRef.current.length === 0 && spokenTailRef.current === "";
                const { sentences, rest } = extractClauses(
                  fresh,
                  isFirst ? FIRST_CLAUSE_CHARS : undefined,
                  isFirst ? FIRST_CLAUSE_MAX_CHARS : undefined
                );
                if (sentences.length) {
                  sentences.forEach(enqueueSpeech);
                  spokenTailRef.current = speakable.slice(0, speakable.length - rest.length);
                }
              }
            } else if (event === "done") {
              newConversationId = payload.conversationId;
            } else if (event === "error") {
              throw new Error(payload.message ?? "The assistant encountered an error.");
            }
          }
        }

        const finalSpeakable = toSpeakable(answer);
        const leftover = finalSpeakable.slice(spokenTailRef.current.length).trim();
        if (leftover) enqueueSpeech(leftover);

        setTurns((prev) => [...prev, { user: trimmed, assistant: answer }]);
        onTurn(trimmed, answer, newConversationId);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setErrorMessage(err?.message ?? "Something went wrong.");
        setPhaseSafe("error");
        return;
      } finally {
        streamDoneRef.current = true;
      }

      if (!pumpingRef.current && clipsRef.current.length === 0) {
        setPhaseSafe("listening");
        resumeListening();
      } else {
        void pump();
      }
    },
    [
      conversationId,
      enqueueSpeech,
      mode,
      modelId,
      onTurn,
      pauseListening,
      pump,
      replyLanguage,
      resumeListening,
      setPhaseSafe,
    ]
  );

  // ---------------------------------------------------------------
  // Transcription
  // ---------------------------------------------------------------
  const handleUtterance = useCallback(
    async (blob: Blob) => {
      if (closingRef.current) return;
      pauseListening();
      setPhaseSafe("transcribing");

      try {
        const form = new FormData();
        form.append("audio", blob, "utterance.webm");
        const res = await fetch("/api/voice/stt", { method: "POST", body: form });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setNotice(json?.error?.message ?? "Could not transcribe that.");
          setPhaseSafe("listening");
          resumeListening();
          return;
        }

        // Too short to be speech — keep listening, say nothing.
        if (json?.data?.tooShort) {
          setPhaseSafe("listening");
          resumeListening();
          return;
        }

        const transcript: string = (json?.data?.transcript ?? "").trim();
        if (!transcript) {
          setNotice("I didn't catch that — please say it again.");
          setPhaseSafe("listening");
          resumeListening();
          return;
        }

        // Answer and speak in the language that was actually spoken.
        const detected = appLanguageFromSarvam(json?.data?.languageCode);
        if (detected) {
          detectedLanguageRef.current = detected;
          setHeardLanguage(getLanguage(detected).nativeName);
          // A different language means a different voice; allow Sarvam
          // TTS to be retried even if it was blocked for the last one.
          ttsBlockedRef.current = false;
          warnedNoVoiceRef.current = false;
        }

        setNotice(null);
        setUserText(transcript);
        await runVoiceTurn(transcript);
      } catch {
        setNotice("Network connection problem.");
        setPhaseSafe("listening");
        resumeListening();
      }
    },
    [pauseListening, resumeListening, runVoiceTurn, setPhaseSafe]
  );

  // ---------------------------------------------------------------
  // Recording segments
  //
  // The recorder runs continuously and is only *sent* when the detector
  // saw real speech. Starting it on detection instead would clip the
  // first syllable, and a webm/opus stream cannot be sliced after the
  // fact because only its first chunk carries the header.
  // ---------------------------------------------------------------
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || closingRef.current) return;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      return;
    }

    chunksRef.current = [];
    heardSpeechRef.current = false;
    segmentStartedAtRef.current = performance.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
  }, []);

  const finishSegment = useCallback(
    (send: boolean) => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder || recorder.state === "inactive") return;

      const spokeLongEnough =
        heardSpeechRef.current &&
        performance.now() - speechStartedAtRef.current >= MIN_SPEECH_MS;
      const type = recorder.mimeType || "audio/webm";
      stoppingRef.current = true;

      recorder.onstop = () => {
        stoppingRef.current = false;
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (send && spokeLongEnough && !closingRef.current) {
          void handleUtterance(blob);
        }
        // Always line up the next segment; handleUtterance gates the mic
        // itself while it works, and resumeListening restarts it cleanly.
        if (!closingRef.current) startSegment();
      };

      try {
        recorder.stop();
      } catch {
        // Already inactive: the segment is over either way.
        stoppingRef.current = false;
      }
    },
    [handleUtterance, startSegment]
  );

  restartSegmentRef.current = () => {
    if (closingRef.current || !streamRef.current) return;
    if (recorderRef.current) finishSegment(false);
    // A stop already in flight will start the next segment in its onstop.
    else if (!stoppingRef.current) startSegment();
  };

  // ---------------------------------------------------------------
  // Voice-activity detection + level meter
  // ---------------------------------------------------------------
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || closingRef.current) return;

    // Allocated once: a new Float32Array every animation frame is ~60
    // throwaway buffers a second for the whole call.
    let buffer = vadBufferRef.current;
    if (!buffer || buffer.length !== analyser.fftSize) {
      buffer = new Float32Array(analyser.fftSize);
      vadBufferRef.current = buffer;
    }
    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);

    setLevel((prev) => prev * 0.7 + Math.min(1, rms * 6) * 0.3);

    const now = performance.now();
    const current = phaseRef.current;

    if (!mutedRef.current) {
      if (current === "speaking") {
        // Barge-in: deliberate, loud speech over the assistant.
        if (now - speakingStartedAtRef.current > ECHO_GRACE_MS && rms > BARGE_THRESHOLD) {
          cancelSpeech();
          chatAbortRef.current?.abort();
          streamDoneRef.current = true;
          setPhaseSafe("listening");
          resumeListening();
        }
      } else if (current === "listening" && listeningRef.current) {
        // The condition above used to be `!speechSupportedRef.current`,
        // which is false in every Chromium browser — so this detector
        // never ran there and no utterance was ever sent.
        if (
          heardSpeechRef.current &&
          (now - speechStartedAtRef.current > MAX_UTTERANCE_MS ||
            now - segmentStartedAtRef.current > MAX_SEGMENT_MS)
        ) {
          // Speaking without a pause for longer than Sarvam will accept.
          // Cut here rather than let the clip grow until it is refused.
          finishSegment(true);
        } else if (rms > SPEECH_THRESHOLD) {
          if (!heardSpeechRef.current) {
            heardSpeechRef.current = true;
            speechStartedAtRef.current = now;
          }
          lastVoiceAtRef.current = now;
        } else if (heardSpeechRef.current && now - lastVoiceAtRef.current > SILENCE_MS) {
          finishSegment(true);
        } else if (!heardSpeechRef.current && now - segmentStartedAtRef.current > IDLE_RESET_MS) {
          finishSegment(false);
        }
      }
    }

  }, [cancelSpeech, finishSegment, resumeListening, setPhaseSafe]);

  /**
   * `tick` is re-created whenever anything it transitively closes over
   * changes — and through finishSegment -> handleUtterance ->
   * runVoiceTurn that includes `conversationId` and the parent's
   * `onTurn`. Naming it directly as a dependency of the lifecycle effect
   * below therefore tore the microphone down and rebuilt it the moment
   * the first spoken turn completed and a conversation id came back,
   * mid-answer. Holding it in a ref lets the effect depend only on
   * stable values while each frame still runs the newest closure.
   */
  const tickRef = useRef(tick);
  tickRef.current = tick;

  // ---------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------
  const teardown = useCallback(() => {
    closingRef.current = true;
    listeningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    chatAbortRef.current?.abort();
    cancelSpeech();

    try {
      recorderRef.current?.stop();
    } catch {
      // Tearing down a recorder that already stopped is fine.
    }
    recorderRef.current = null;
    chunksRef.current = [];

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    vadBufferRef.current = null;
  }, [cancelSpeech]);

  useEffect(() => {
    if (!open) return;

    closingRef.current = false;
    cancelSpeechRef.current = false;
    streamDoneRef.current = true;
    ttsBlockedRef.current = false;
    warnedNoVoiceRef.current = false;
    detectedLanguageRef.current = null;
    audioIdxRef.current = 0;
    clipsRef.current = [];
    listeningRef.current = true;
    setErrorMessage(null);
    setNotice(null);
    setUserText("");
    setAnswerText("");
    setHeardLanguage(null);
    setTurns([]);
    setPhaseSafe("starting");

    let cancelled = false;

    (async () => {
      try {
        unlockAudioPlayback();

        // Some browsers only populate the voice list asynchronously; ask
        // early so hasBrowserVoiceFor has something to inspect later.
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.getVoices();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const Ctor: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
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
        segmentStartedAtRef.current = performance.now();

        startSegment();

        const frame = () => {
          if (closingRef.current) return;
          tickRef.current();
          rafRef.current = requestAnimationFrame(frame);
        };
        rafRef.current = requestAnimationFrame(frame);
      } catch (err: any) {
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        setErrorMessage(
          denied
            ? "Microphone access was blocked. Allow it in your browser address bar and try again."
            : "Could not start the microphone."
        );
        setPhaseSafe("error");
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [open, setPhaseSafe, startSegment, teardown, unlockAudioPlayback]);

  // Keyboard shortcuts (Esc, M)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) {
        setMuted((m) => {
          const next = !m;
          if (next) pauseListening();
          else resumeListening();
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pauseListening, resumeListening]);

  if (!open) return null;

  const statusLabel =
    phase === "starting"
      ? "Initializing voice…"
      : phase === "listening"
        ? muted
          ? "Microphone muted"
          : "Listening… Speak anytime"
        : phase === "transcribing"
          ? "Understanding your question…"
          : phase === "thinking"
            ? "Thinking…"
            : phase === "speaking"
              ? "Speaking… (Tap to interrupt)"
              : "Voice mode stopped";

  const orbScale = 1 + (phase === "listening" && !muted ? level * 0.45 : phase === "speaking" ? 0.18 : 0);

  const interrupt = () => {
    cancelSpeech();
    chatAbortRef.current?.abort();
    streamDoneRef.current = true;
    setPhaseSafe("listening");
    resumeListening();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice conversation with LegalSetu"
      onClick={unlockAudioPlayback}
      className="fixed inset-0 z-[120] flex flex-col bg-gradient-to-b from-slate-950 via-[#080d19] to-slate-950 select-none"
    >
      {/* Dual audio elements for gapless playback */}
      <audio ref={audioElARef} preload="auto" />
      <audio ref={audioElBRef} preload="auto" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandBlue/15 text-brandBlue">
            <AudioLines className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Voice Mode (Continuous)</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              {mode === "case"
                ? "Case Analysis"
                : mode === "quick"
                  ? "Quick Answer"
                  : mode === "fir"
                    ? "Generate FIR"
                    : "Know the Law"}
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
            <p className="mt-4 text-base font-semibold text-white">Voice mode unavailable</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{errorMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Return to text chat
            </button>
          </div>
        ) : (
          <>
            {/* Interactive Animated Orb */}
            <div
              className="relative flex h-52 w-52 cursor-pointer items-center justify-center sm:h-64 sm:w-64"
              onClick={() => {
                unlockAudioPlayback();
                if (phase === "speaking") interrupt();
              }}
              title={phase === "speaking" ? "Click to interrupt" : undefined}
            >
              <span
                className={
                  "absolute inset-0 rounded-full blur-3xl transition-opacity duration-500 " +
                  (phase === "speaking"
                    ? "bg-emerald-500/30 opacity-100 animate-pulse"
                    : phase === "thinking" || phase === "transcribing"
                      ? "bg-amber-500/25 opacity-100"
                      : muted
                        ? "bg-slate-500/20 opacity-70"
                        : "bg-brandBlue/35 opacity-100")
                }
              />
              {(phase === "listening" && !muted) || phase === "speaking" ? (
                <>
                  <span className="absolute inset-4 animate-ping rounded-full border border-white/15" />
                  <span className="absolute inset-8 animate-pulse rounded-full border border-white/20" />
                </>
              ) : null}

              <div
                style={{ transform: `scale(${orbScale.toFixed(3)})` }}
                className={
                  "relative flex h-36 w-36 items-center justify-center rounded-full shadow-2xl transition-transform duration-[50ms] sm:h-44 sm:w-44 " +
                  (phase === "speaking"
                    ? "bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-700 shadow-emerald-500/30"
                    : phase === "thinking" || phase === "transcribing"
                      ? "bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700 shadow-amber-500/30"
                      : muted
                        ? "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-700/30"
                        : "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-800 shadow-blue-500/40")
                }
              >
                {phase === "thinking" || phase === "transcribing" || phase === "starting" ? (
                  <Loader2 className="h-11 w-11 animate-spin text-white" />
                ) : phase === "speaking" ? (
                  <Volume2 className="h-11 w-11 text-white animate-bounce" />
                ) : muted ? (
                  <MicOff className="h-11 w-11 text-white" />
                ) : (
                  <Mic className="h-11 w-11 text-white" />
                )}
              </div>
            </div>

            {/* Status & Live Transcript */}
            <div className="w-full max-w-2xl text-center" aria-live="polite">
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
                {statusLabel}
              </p>

              {heardLanguage && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Heard <span className="font-semibold text-slate-300">{heardLanguage}</span> — replying in{" "}
                  <span className="font-semibold text-slate-300">{getLanguage(replyLanguage()).nativeName}</span>
                </p>
              )}

              {notice && (
                <p className="mx-auto mt-3 max-w-md rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {notice}
                </p>
              )}

              {/* Scrollable Conversation History */}
              {turns.length > 0 && (
                <div className="mt-4 max-h-[16vh] space-y-2 overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
                  {turns.map((t, i) => (
                    <div key={i} className="text-left text-xs">
                      <p className="text-slate-400"><span className="font-semibold text-slate-300">You:</span> {t.user}</p>
                      <p className="mt-0.5 text-slate-400"><span className="font-semibold text-brandBlue">LegalSetu:</span> {t.assistant.slice(0, 150)}{t.assistant.length > 150 ? "…" : ""}</p>
                    </div>
                  ))}
                </div>
              )}

              {userText && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">You said</p>
                  <p className="mt-1 text-base font-medium leading-relaxed text-white">
                    {userText}
                  </p>
                </div>
              )}

              {answerText && (
                <div className="mt-3 max-h-[30vh] overflow-y-auto rounded-2xl border border-brandBlue/30 bg-brandBlue/10 px-5 py-3 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brandBlue">LegalSetu speaking</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
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
        <div className="flex items-center justify-center gap-5 px-6 pb-10 pt-2">
          <button
            type="button"
            onClick={() => {
              unlockAudioPlayback();
              setMuted((m) => {
                const next = !m;
                if (next) pauseListening();
                else resumeListening();
                return next;
              });
            }}
            aria-pressed={muted}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            className={
              "flex h-14 w-14 items-center justify-center rounded-full border transition-all hover:scale-105 " +
              (muted
                ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                : "border-white/15 bg-white/5 text-white hover:bg-white/10")
            }
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="End voice conversation"
            className="flex h-16 items-center gap-2.5 rounded-full bg-rose-600 px-8 text-base font-bold text-white shadow-lg shadow-rose-600/30 transition-all hover:scale-105 hover:bg-rose-500"
          >
            <X className="h-5 w-5" />
            End
          </button>

          {phase === "speaking" && (
            <button
              type="button"
              onClick={interrupt}
              aria-label="Interrupt speaking"
              title="Interrupt and speak"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 transition-all hover:scale-105 hover:bg-emerald-500/30"
            >
              <Volume2 className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
