"use client";

// ==========================================================
// LegalSetu — Automatic DOM Translator
// ----------------------------------------------------------
// This is what makes the app fully multilingual WITHOUT any
// per-language JSON files and without wrapping every string in
// a t() call.
//
// How it works:
//   1. Walk the live DOM and collect every meaningful text node
//      plus translatable attributes (placeholder, title, alt,
//      aria-label).
//   2. Send the unique strings to /api/i18n/translate in one
//      batch, then write the results straight back into the DOM.
//   3. A MutationObserver repeats this for anything React
//      renders later — route changes, dialogs, streamed data,
//      and records loaded from the backend.
//
// Every node's original English text is remembered, so
// switching back to English is instant and needs no network
// call at all.
//
// Opting out: put data-no-translate on any element. Used for
// the language switcher (native names stay native), the user's
// own typed messages, and AI answers — which the model already
// writes in the chosen language.
//
// The DOM bookkeeping lives in lib/i18n/dom.ts so it can be
// unit tested; this component is just the React lifecycle and
// the network batching around it.
// ==========================================================

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { DEFAULT_LANGUAGE } from "@/lib/i18n/languages";
import {
  applyTranslations,
  collectTranslatable,
  restoreOriginals,
  TRANSLATABLE_ATTRIBUTES,
} from "@/lib/i18n/dom";

const DEBOUNCE_MS = 180;

export function AutoTranslate() {
  const { language, translate } = useLanguage();

  // Latest values, readable from inside long-lived observer callbacks.
  const languageRef = useRef(language);
  const translateRef = useRef(translate);
  languageRef.current = language;
  translateRef.current = translate;

  const applyingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    // English is the source language: restore anything we changed and
    // then do no work at all.
    if (language === DEFAULT_LANGUAGE) {
      restoreOriginals(document.body);
      return;
    }

    let cancelled = false;

    const run = async () => {
      if (cancelled || applyingRef.current) return;
      if (languageRef.current === DEFAULT_LANGUAGE) return;

      const collected = collectTranslatable(document.body);
      if (collected.texts.length === 0 && collected.attrs.length === 0) return;

      const sources = [
        ...collected.texts.map((t) => t.source),
        ...collected.attrs.map((a) => a.source),
      ];

      const requestLanguage = languageRef.current;
      const translations = await translateRef.current(sources);

      // The user switched languages while we were waiting — drop this pass.
      if (cancelled || requestLanguage !== languageRef.current) return;

      applyingRef.current = true;
      try {
        applyTranslations(collected, translations);
      } finally {
        // Discard the mutation records our own writes just produced,
        // otherwise the observer would trigger itself forever.
        observerRef.current?.takeRecords();
        applyingRef.current = false;
      }
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void run();
      }, DEBOUNCE_MS);
    };

    // First pass over whatever is already on screen.
    schedule();

    // Catch everything rendered later: navigation, dialogs, backend data.
    const observer = new MutationObserver((records) => {
      if (applyingRef.current) return;
      const meaningful = records.some((r) =>
        r.type === "childList" ? r.addedNodes.length > 0 : true
      );
      if (meaningful) schedule();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
    observerRef.current = observer;

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      observer.disconnect();
      observerRef.current = null;
    };
  }, [language]);

  return null;
}
