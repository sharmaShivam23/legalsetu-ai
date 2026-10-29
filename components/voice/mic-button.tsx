"use client";

// ==========================================================
// LegalSetu — Dictation microphone
// ----------------------------------------------------------
// Tap to record, tap to stop. The clip goes to /api/voice/stt,
// which transcribes it with Sarvam server-side and returns the
// text plus the language it detected.
//
// One path, deliberately. This used to prefer the browser's own
// SpeechRecognition and fall back to the server only when the
// browser had none — but that check (`speech.supported`) is true
// in every Chromium browser, so in practice the server path was
// never reached, and the recogniser was always told to listen in
// the INTERFACE language. Someone reading the app in English and
// speaking Hindi got an en-IN recogniser and nonsense back.
//
// Sarvam detects the language from the audio instead of being
// told, so the same button works whatever the user speaks and
// whatever the interface is set to. It costs one upload, which
// for a dictated sentence is well under a second.
//
// (components/voice/voice-mode.tsx has the same reasoning for
// the continuous conversational loop.)
// ==========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type MicState = "idle" | "listening" | "processing" | "error";

/**
 * Hard ceiling on one dictation. Guards against a recording left
 * running by accident: the server rejects anything over 8MB, and a
 * clip that long is not a dictated question anyway.
 */
const MAX_RECORDING_MS = 60_000;

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function MicButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<MicState>("idle");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (limitTimerRef.current) {
      clearTimeout(limitTimerRef.current);
      limitTimerRef.current = null;
    }
  }, []);

  // A recording still running when the component goes away would hold
  // the microphone open and leave the browser's recording indicator on.
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // Already inactive.
      }
      releaseStream();
    };
  }, [releaseStream]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setState("processing");
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        releaseStream();

        try {
          const form = new FormData();
          form.append("audio", blob, "dictation.webm");

          const res = await fetch("/api/voice/stt", { method: "POST", body: form });
          const json = await res.json().catch(() => null);

          const transcript: string = (json?.data?.transcript ?? "").trim();
          if (res.ok && transcript) {
            onTranscript(transcript);
            setState("idle");
          } else {
            // Nothing heard, or the service refused. Flash the error
            // state rather than failing silently, which is how the old
            // implementation hid a broken microphone.
            setState("error");
            setTimeout(() => setState("idle"), 2000);
          }
        } catch {
          setState("error");
          setTimeout(() => setState("idle"), 2000);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setState("listening");

      limitTimerRef.current = setTimeout(() => {
        try {
          recorderRef.current?.stop();
        } catch {
          // Already stopped.
        }
      }, MAX_RECORDING_MS);
    } catch {
      releaseStream();
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [onTranscript, releaseStream]);

  const stopRecording = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      // Already inactive; onstop has run or will not fire.
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "listening") stopRecording();
    else if (state !== "processing") void startRecording();
  }, [startRecording, state, stopRecording]);

  const listening = state === "listening";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "processing"}
      aria-label={listening ? "Stop recording" : "Start voice input"}
      title={
        listening
          ? "Stop recording"
          : "Speak your question in any Indian language"
      }
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 select-none",
        state === "idle" &&
          "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 shadow-xs",
        listening && "border-rose-600 bg-rose-600 text-white shadow-md animate-pulse",
        state === "processing" &&
          "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed",
        state === "error" && "border-rose-200 bg-rose-50 text-rose-600"
      )}
    >
      {listening && <Square className="h-4 w-4 fill-current" />}
      {state === "processing" && (
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      )}
      {(state === "idle" || state === "error") && <Mic className="h-4 w-4" />}
    </button>
  );
}
