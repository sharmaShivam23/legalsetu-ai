/**
 * Compatibility re-export.
 *
 * The language registry moved to `lib/i18n/languages.ts`, which is
 * now the single source of truth for the whole runtime-translation
 * system (no per-language JSON files anywhere in this project).
 * This file stays so older imports keep working.
 */
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  getLanguage,
  getLanguageByCode,
  isSupportedLanguage,
  isRTL,
  languageName,
  normalizeLanguage,
  speechCodeFor,
  type LanguageDef,
  type LanguageCode,
} from "@/lib/i18n/languages";
