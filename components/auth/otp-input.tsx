"use client";

// ==========================================================
// LegalSetu — 6-digit code entry
// ----------------------------------------------------------
// One box per digit, auto-advancing, with paste support — the
// pattern people expect from a bank OTP screen, which is exactly
// the mental model here: this code protects an account, not a
// throwaway newsletter signup.
// ==========================================================

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

const LENGTH = 6;

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired once when all six digits are present. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const digits = value.padEnd(LENGTH, " ").split("").slice(0, LENGTH);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [firedComplete, setFiredComplete] = useState(false);

  useEffect(() => {
    if (value.length === LENGTH && !firedComplete) {
      setFiredComplete(true);
      onComplete?.(value);
    }
    if (value.length < LENGTH) setFiredComplete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setDigitAt(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join("").trimEnd());
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1);
    if (!char) {
      setDigitAt(index, " ");
      return;
    }
    setDigitAt(index, char);
    if (index < LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digit.trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          className={cn(
            "h-12 w-10 rounded-xl border-2 bg-white text-center text-xl font-bold text-slate-900 transition-all focus:outline-none dark:bg-slate-900 dark:text-white sm:h-14 sm:w-12",
            error
              ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
              : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700",
            disabled && "opacity-50"
          )}
        />
      ))}
    </div>
  );
}
