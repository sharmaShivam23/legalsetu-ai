"use client";

// ==========================================================
// LegalSetu — Language-aware speech (input + output)
// ----------------------------------------------------------
// Voice follows the same language the rest of the app is in:
// choose Punjabi and the mic listens for Punjabi and answers
// are read back in Punjabi.
//
// Recognition uses the browser's Web Speech API when available
// (instant, free, no upload). Languages without a browser voice
// — Bhojpuri, Maithili, Santali — fall back to the closest
// available tag, and callers can always fall back to the
// server route at /api/voice/transcribe.
// ==========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { speechCodeFor } from "@/lib/i18n/languages";

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

export interface UseVoiceInputResult {
  /** True while the mic is actively listening. */
  listening: boolean;
  /** Final transcript so far. */
  transcript: string;
  /** Live partial text while the user is still speaking. */
  interim: string;
  /** False when the browser has no speech recognition at all. */
  supported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Speech-to-text in the app's current language.
 * `languageOverride` lets the settings page preview a different
 * voice language without changing the interface language.
 */
export function useVoiceInput(languageOverride?: string): UseVoiceInputResult {
  const { language } = useLanguage();
  const speechLang = speechCodeFor(languageOverride ?? language);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
  }, []);

  // Recreate the recogniser whenever the language changes so the
  // engine is always listening for the right language.
  useEffect(() => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = speechLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else partial += result[0].transcript;
      }
      if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText).trim());
      setInterim(partial);
    };

    recognition.onerror = (event: any) => {
      const code = event?.error ?? "unknown";
      setError(
        code === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : code === "no-speech"
            ? "No speech was detected. Please try again."
            : "Speech recognition failed. Please try again or type instead."
      );
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
      recognitionRef.current = null;
    };
  }, [speechLang]);

  const start = useCallback(() => {
    setError(null);
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("This browser does not support voice input. Please type instead.");
      return;
    }
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if it is already running — harmless.
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Not running.
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { listening, transcript, interim, supported, error, start, stop, reset };
}

export interface UseSpeakResult {
  speaking: boolean;
  supported: boolean;
  speak: (text: string) => void;
  stop: () => void;
}

/** Reads text aloud in the app's current language. */
export function useSpeak(languageOverride?: string): UseSpeakResult {
  const { language } = useLanguage();
  const speechLang = speechCodeFor(languageOverride ?? language);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = speechLang;

      // Prefer a voice that actually matches the language, then the
      // same base language, before letting the browser decide.
      const voices = window.speechSynthesis.getVoices();
      const base = speechLang.split("-")[0];
      utterance.voice =
        voices.find((v) => v.lang === speechLang) ??
        voices.find((v) => v.lang?.startsWith(base)) ??
        null;

      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [speechLang]
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speaking, supported, speak, stop };
}
