"use client";

// ==========================================================
// LegalSetu — Language Provider
// ----------------------------------------------------------
// Owns the single "current language" for the whole app and
// exposes one primitive: translate(strings) -> strings.
//
// Persistence, in priority order on first load:
//   1. localStorage  (instant, survives refresh)
//   2. cookie        (so the server can render <html lang>)
//   3. signed-in user's saved preference
//   4. English
//
// A browser-local cache means switching back to a language you
// have used before is instant and costs zero API calls.
// ==========================================================

import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  getLanguage,
  normalizeLanguage,
  type LanguageCode,
} from "@/lib/i18n/languages";

const STORAGE_KEY = "ls_lang";
// Bumped to v2: v1 caches in existing browsers may hold placeholder
// strings written while the demo provider was active. Changing the
// key makes every browser discard them instead of showing stale text.
const CACHE_PREFIX = "ls_i18n_v2_";
const CACHE_LIMIT = 3000;
const MAX_PER_REQUEST = 150;

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  /** True while a translation pass is in flight. */
  isTranslating: boolean;
  /** True once the stored preference has been read on the client. */
  isReady: boolean;
  /** Translate many strings; resolves in the same order as the input. */
  translate: (texts: string[]) => Promise<string[]>;
  /** Increments whenever the language changes — used to re-run effects. */
  version: number;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Reads a cookie without pulling in a dependency. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  // One year, site-wide. Not sensitive data, so no HttpOnly requirement.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Per-language translation cache held in localStorage. */
function loadCache(language: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + language);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Loads the static language pack built by scripts/build-language-packs.ts
 * (public/i18n/<lang>.json). One small CDN file holds every interface
 * string already translated, so a language switch no longer waits on
 * hundreds of live API calls — which on a fresh deployment, with an empty
 * translation cache, took ~30 minutes per language. A missing pack is not
 * an error: the live API simply covers everything, as before.
 */
async function fetchPack(language: string): Promise<Record<string, string>> {
  try {
    // no-cache = revalidate with the CDN (a cheap 304) so a redeploy with
    // fresh translations is picked up, without re-downloading every time.
    const res = await fetch(`/i18n/${language}.json`, { cache: "no-cache" });
    if (!res.ok) return {};
    const json = await res.json();
    return json && typeof json === "object" ? (json as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveCache(language: string, cache: Record<string, string>): void {
  try {
    const keys = Object.keys(cache);
    let toStore = cache;
    if (keys.length > CACHE_LIMIT) {
      // Keep the most recently added half — insertion order is preserved
      // for string keys, so slicing from the end keeps the newest.
      toStore = {};
      for (const key of keys.slice(keys.length - Math.floor(CACHE_LIMIT / 2))) {
        toStore[key] = cache[key];
      }
    }
    localStorage.setItem(CACHE_PREFIX + language, JSON.stringify(toStore));
  } catch {
    // Quota exceeded / private mode — the in-memory cache still works.
  }
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** Server-read cookie value, so the first paint matches the choice. */
  initialLanguage?: string;
}) {
  const [language, setLanguageState] = useState<LanguageCode>(
    normalizeLanguage(initialLanguage)
  );
  const [isReady, setIsReady] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [version, setVersion] = useState(0);

  // Cache for the active language, mirrored to localStorage.
  const cacheRef = useRef<Record<string, string>>({});
  // De-duplicates concurrent requests for the same string.
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  // Static language packs, loaded once per language per page load.
  const packsRef = useRef<Record<string, Record<string, string>>>({});
  const packLoadsRef = useRef<Map<string, Promise<void>>>(new Map());
  const ensurePack = useCallback((code: string): Promise<void> => {
    if (code === DEFAULT_LANGUAGE) return Promise.resolve();
    let load = packLoadsRef.current.get(code);
    if (!load) {
      load = fetchPack(code).then((pack) => {
        packsRef.current[code] = pack;
      });
      packLoadsRef.current.set(code, load);
    }
    return load;
  }, []);
  const activeRequests = useRef(0);
  // Warn about an unreachable translation provider only once per switch,
  // instead of on every batch the page sends.
  const warnedRef = useRef(false);

  // Resolve the stored preference once, on the client.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    const resolved = normalizeLanguage(stored ?? readCookie(LANGUAGE_COOKIE) ?? initialLanguage);

    cacheRef.current = loadCache(resolved);
    void ensurePack(resolved);
    setLanguageState(resolved);
    setIsReady(true);
    if (resolved !== DEFAULT_LANGUAGE) setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <html lang> and text direction honest for a11y and RTL (Urdu).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const def = getLanguage(language);
    document.documentElement.lang = def.code;
    document.documentElement.dir = def.dir;
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    const next = normalizeLanguage(code);
    setLanguageState((current) => {
      if (current === next) return current;
      cacheRef.current = loadCache(next);
      void ensurePack(next);
      inFlightRef.current.clear();
      warnedRef.current = false;
      return next;
    });

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal — the cookie below still carries the choice.
    }
    writeCookie(LANGUAGE_COOKIE, next);
    setVersion((v) => v + 1);

    // Persist for signed-in users; anonymous users get a 401 we ignore.
    void fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interfaceLanguage: next,
        responseLanguage: next,
        voiceLanguage: next,
      }),
    }).catch(() => {});
  }, []);

  /**
   * Translates strings, answering from cache where possible and
   * batching the remainder. Always resolves to an array the same
   * length as the input; anything that fails stays as-is.
   */
  const translate = useCallback(
    async (texts: string[]): Promise<string[]> => {
      if (language === DEFAULT_LANGUAGE || texts.length === 0) return texts;

      // The static pack answers almost every interface string instantly.
      await ensurePack(language);
      const pack = packsRef.current[language] ?? {};
      const cache = cacheRef.current;
      const known = (t: string) => pack[t] ?? cache[t];
      const missing = Array.from(new Set(texts.filter((t) => t && known(t) === undefined)));

      if (missing.length > 0) {
        const requestLanguage = language;
        activeRequests.current += 1;
        setIsTranslating(true);

        try {
          const slices: string[][] = [];
          for (let i = 0; i < missing.length; i += MAX_PER_REQUEST) {
            slices.push(missing.slice(i, i + MAX_PER_REQUEST));
          }

          // In parallel: these used to go one after another, each waiting
          // for the previous batch's translations to finish.
          await Promise.all(
            slices.map(async (slice) => {
              const res = await fetch("/api/i18n/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texts: slice, target: requestLanguage }),
              });

              if (!res.ok) return;
              const json = await res.json();
              const translations: unknown = json?.data?.translations;
              if (!Array.isArray(translations)) return;

              // The provider is unreachable or misconfigured (bad API key,
              // quota exhausted). Say so — otherwise the page just stays in
              // English and looks broken.
              if (json?.data?.degraded && !warnedRef.current) {
                warnedRef.current = true;
                toast.error(
                  "Translation is unavailable right now, so text is still showing in English. Check the AI provider API key.",
                  { duration: 6000 }
                );
              }

              slice.forEach((source, index) => {
                const value = translations[index];
                if (typeof value === "string" && value) cache[source] = value;
              });
            })
          );

          // Ignore replies that arrived after the user switched again.
          if (requestLanguage !== language) return texts;
          saveCache(requestLanguage, cache);
        } catch {
          // Network failure — fall through and return what we have.
        } finally {
          activeRequests.current -= 1;
          if (activeRequests.current <= 0) {
            activeRequests.current = 0;
            setIsTranslating(false);
          }
        }
      }

      return texts.map((text) => pack[text] ?? cache[text] ?? text);
    },
    [language, ensurePack]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, isTranslating, isReady, translate, version }),
    [language, setLanguage, isTranslating, isReady, translate, version]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>.");
  }
  return ctx;
}

/**
 * Safe variant for components that may render outside the provider
 * (e.g. isolated tests or a stray portal) — returns English defaults
 * instead of throwing.
 */
export function useLanguageSafe(): LanguageContextValue {
  return (
    useContext(LanguageContext) ?? {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      isTranslating: false,
      isReady: true,
      translate: async (texts: string[]) => texts,
      version: 0,
    }
  );
}
