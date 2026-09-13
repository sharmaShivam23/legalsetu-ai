"use client";

// ==========================================================
// LegalSetu — Language Switcher
// ----------------------------------------------------------
// Choosing a language here re-renders the ENTIRE app in that
// language: interface copy, records loaded from the backend,
// AI answers, and voice input/output.
//
// The whole control carries data-no-translate so language
// names always stay in their own script — "हिन्दी" must read
// as "हिन्दी" no matter which language is active.
// ==========================================================

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SUPPORTED_LANGUAGES, getLanguage } from "@/lib/i18n/languages";
import { useLanguage } from "@/components/providers/LanguageProvider";

type Variant = "navbar" | "sidebar" | "compact";

export function LanguageSwitcher({
  variant = "navbar",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const { language, setLanguage, isTranslating } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = getLanguage(language);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (code: string) => {
    setLanguage(code);
    setOpen(false);
  };

  const triggerClass = cn(
    "flex items-center gap-2 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brandBlue focus-visible:ring-offset-1",
    variant === "navbar" &&
      "rounded-full border border-slate-200/80 dark:border-white/20 bg-white/70 dark:bg-white/10 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/20",
    variant === "sidebar" &&
      "w-full rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary shadow-sm hover:border-brandBlue/30",
    variant === "compact" &&
      "rounded-lg border border-borderCustom bg-canvas px-2.5 py-1.5 text-sm text-textPrimary hover:border-brandBlue/40",
    className
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      data-no-translate
      translate="no"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Change language. Current language: ${active.englishName}`}
      >
        {isTranslating ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brandBlue" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 text-brandBlue" />
        )}

        <span className={cn("truncate", variant === "sidebar" && "flex-1 text-left")}>
          {active.nativeName}
        </span>

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className={cn(
            "absolute z-[70] max-h-80 w-56 overflow-y-auto rounded-xl border border-borderCustom bg-card p-1.5 shadow-xl",
            variant === "navbar" ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2"
          )}
        >
          {SUPPORTED_LANGUAGES.map((option) => {
            const selected = option.code === language;
            return (
              <li key={option.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(option.code)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-brandBlue/10 font-semibold text-brandBlue"
                      : "text-textPrimary hover:bg-canvas"
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate" dir={option.dir}>
                      {option.nativeName}
                    </span>
                    <span className="truncate text-[11px] text-textSecondary">
                      {option.englishName}
                    </span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
