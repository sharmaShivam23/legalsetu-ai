"use client";

import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type MicState = "idle" | "listening" | "processing" | "error";

export function MicButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<MicState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

        try {
          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            onTranscript(data.data.text);
          }
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

  return (
    <button
      type="button"
      onClick={state === "listening" ? stopRecording : startRecording}
      disabled={state === "processing"}
      aria-label={state === "listening" ? "Stop recording" : "Start voice input"}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 select-none",
        state === "idle" &&
          "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 shadow-xs",
        state === "listening" &&
          "border-rose-600 bg-rose-600 text-white shadow-md animate-pulse",
        state === "processing" &&
          "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed",
        state === "error" &&
          "border-rose-200 bg-rose-50 text-rose-600"
      )}
    >
      {state === "listening" && <Square className="h-4 w-4 fill-current" />}
      {state === "processing" && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
      {(state === "idle" || state === "error") && <Mic className="h-4 w-4" />}
    </button>
  );
}
