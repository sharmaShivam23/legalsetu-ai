"use client";

// ==========================================================
// LegalSetu — Language-aware microphone
// ----------------------------------------------------------
// Speaks the same language as the rest of the app. Two paths:
//
//  1. The browser's own speech recognition, when available.
//     Instant, free, no upload, and genuinely good at the major
//     Indian languages in Chrome/Edge.
//  2. Otherwise record and send to /api/voice/transcribe WITH
//     the chosen language, so the model transcribes in that
//     language's script instead of translating to English.
// ==========================================================

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useVoiceInput } from "@/hooks/use-speech";

type MicState = "idle" | "listening" | "processing" | "error";

export function MicButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const { language } = useLanguage();
  const [state, setState] = useState<MicState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Path 1 — browser speech recognition in the chosen language.
  const speech = useVoiceInput();
  const lastSentRef = useRef("");

  // Forward each finalised phrase exactly once.
  useEffect(() => {
    if (!speech.transcript || speech.transcript === lastSentRef.current) return;
    const addition = speech.transcript.slice(lastSentRef.current.length).trim();
    lastSentRef.current = speech.transcript;
    if (addition) onTranscript(addition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript]);

  useEffect(() => {
    if (speech.supported) setState(speech.listening ? "listening" : "idle");
  }, [speech.listening, speech.supported]);

  // Path 2 — record and transcribe on the server.
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        // Tell the server which language to expect.
        formData.append("language", language);

        try {
          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success && data.data?.text) onTranscript(data.data.text);
        } finally {
          setState("idle");
          stream.getTracks().forEach((t) => t.stop());
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState("listening");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function toggle() {
    if (speech.supported) {
      // Browser recognition — no upload needed.
      if (speech.listening) {
        speech.stop();
      } else {
        lastSentRef.current = "";
        speech.reset();
        speech.start();
      }
      return;
    }
    if (state === "listening") stopRecording();
    else void startRecording();
  }

  const listening = state === "listening";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "processing"}
      aria-label={listening ? "Stop recording" : "Start voice input"}
      title={listening ? "Stop recording" : "Speak your question"}
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
