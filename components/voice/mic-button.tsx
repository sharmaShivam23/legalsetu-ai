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
        "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        state === "idle" && "bg-slate-100 text-slate-500 hover:bg-slate-200",
        state === "listening" && "bg-red-500 text-white",
        state === "processing" && "bg-slate-200 text-slate-400",
        state === "error" && "bg-red-100 text-red-500"
      )}
    >
      {state === "listening" && <Square className="h-4 w-4" />}
      {state === "processing" && <Loader2 className="h-4 w-4 animate-spin" />}
      {(state === "idle" || state === "error") && <Mic className="h-5 w-5" />}
    </button>
  );
}
