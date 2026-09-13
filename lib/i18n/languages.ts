// ==========================================================
// LegalSetu — Language Registry
// ----------------------------------------------------------
// Single source of truth for every language in the app.
//
// There are deliberately NO per-language JSON/locale files in
// this project. Every string — UI copy, backend data, and AI
// output — is translated at runtime by lib/i18n/translator.ts
// and cached. Adding a language means adding ONE row here.
// ==========================================================

export type LanguageCode = string;

export interface LanguageDef {
  /** Short code used everywhere internally + stored in the DB. */
  code: LanguageCode;
  /** Name used when instructing the AI model (English names translate best). */
  englishName: string;
  /** Name shown in the switcher — always rendered untranslated. */
  nativeName: string;
  /** BCP-47 tag for Web Speech API (recognition + synthesis). */
  speechCode: string;
  /** Text direction of the script. */
  dir: "ltr" | "rtl";
}

export const DEFAULT_LANGUAGE: LanguageCode = "en";

/**
 * English + the 15 most-spoken Indian languages (2011 Census
 * ranking by number of speakers). Bhojpuri, Maithili and
 * Santali have no dedicated speech-recognition voice on most
 * browsers, so they fall back to the closest available tag.
 */
export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: "en", englishName: "English", nativeName: "English", speechCode: "en-IN", dir: "ltr" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", speechCode: "hi-IN", dir: "ltr" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা", speechCode: "bn-IN", dir: "ltr" },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी", speechCode: "mr-IN", dir: "ltr" },
  { code: "te", englishName: "Telugu", nativeName: "తెలుగు", speechCode: "te-IN", dir: "ltr" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்", speechCode: "ta-IN", dir: "ltr" },
  { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી", speechCode: "gu-IN", dir: "ltr" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو", speechCode: "ur-IN", dir: "rtl" },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ", speechCode: "kn-IN", dir: "ltr" },
  { code: "or", englishName: "Odia", nativeName: "ଓଡ଼ିଆ", speechCode: "or-IN", dir: "ltr" },
  { code: "ml", englishName: "Malayalam", nativeName: "മലയാളം", speechCode: "ml-IN", dir: "ltr" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ", speechCode: "pa-IN", dir: "ltr" },
  { code: "as", englishName: "Assamese", nativeName: "অসমীয়া", speechCode: "as-IN", dir: "ltr" },
  { code: "mai", englishName: "Maithili", nativeName: "मैथिली", speechCode: "hi-IN", dir: "ltr" },
  { code: "bho", englishName: "Bhojpuri", nativeName: "भोजपुरी", speechCode: "hi-IN", dir: "ltr" },
  { code: "sat", englishName: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", speechCode: "hi-IN", dir: "ltr" },
];

const BY_CODE = new Map(SUPPORTED_LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code?: string | null): LanguageDef {
  return (code && BY_CODE.get(code)) || BY_CODE.get(DEFAULT_LANGUAGE)!;
}

export function isSupportedLanguage(code?: string | null): boolean {
  return Boolean(code && BY_CODE.has(code));
}

/** Normalizes any incoming value to a language we actually support. */
export function normalizeLanguage(code?: string | null): LanguageCode {
  return isSupportedLanguage(code) ? (code as LanguageCode) : DEFAULT_LANGUAGE;
}

export function isRTL(code?: string | null): boolean {
  return getLanguage(code).dir === "rtl";
}

/** English name — used when telling the AI which language to answer in. */
export function languageName(code?: string | null): string {
  return getLanguage(code).englishName;
}

export function speechCodeFor(code?: string | null): string {
  return getLanguage(code).speechCode;
}

/** Cookie the server reads to render the first paint in the right language. */
export const LANGUAGE_COOKIE = "ls_lang";

// Backwards-compatible alias — older imports used `getLanguageByCode`.
export const getLanguageByCode = (code: string): LanguageDef | undefined =>
  BY_CODE.get(code);
