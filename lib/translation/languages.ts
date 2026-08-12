export interface LanguageDef {
  code: string;
  englishName: string;
  nativeName: string;
}

/**
 * Centralized language registry — the single source of truth
 * for every language selector in the app (interface / response /
 * voice). Adding a new language means adding ONE entry here,
 * not creating new translation JSON files.
 */
export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা" },
  { code: "te", englishName: "Telugu", nativeName: "తెలుగు" },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்" },
  { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ml", englishName: "Malayalam", nativeName: "മലയാളം" },
  { code: "or", englishName: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "as", englishName: "Assamese", nativeName: "অসমীয়া" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو" },
  { code: "bho", englishName: "Bhojpuri", nativeName: "भोजपुरी" },
  { code: "mai", englishName: "Maithili", nativeName: "मैथिली" },
];

export function getLanguageByCode(code: string): LanguageDef | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}
