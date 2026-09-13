// ==========================================================
// LegalSetu — Translation Glossary / Citation Protection
// ----------------------------------------------------------
// A mistranslated statute reference is worse than an
// untranslated one. Before any text is sent to the model we
// mask the tokens that MUST survive verbatim — act names,
// section numbers, URLs, emails, the product name — with
// {{n}} placeholders, then restore them afterwards.
//
// This is belt-and-braces: the translator prompt also tells
// the model to preserve them, but masking means correctness
// does not depend on the model obeying an instruction.
// ==========================================================

/** Exact terms that must never be translated (case-insensitive match). */
export const PROTECTED_TERMS: string[] = [
  "LegalSetu",
  "Zero FIR",
  "e-FIR",
  "FIR",
  "BNSS",
  "BNS",
  "CrPC",
  "IPC",
  "SHO",
  "Aadhaar",
  "PAN",
  "OTP",
  "PDF",
  "OCR",
  "SMS",
  "API",
  "AI",
];

/**
 * Structural patterns that must survive verbatim.
 * Order matters — longer/more specific patterns run first.
 */
const PROTECTED_PATTERNS: RegExp[] = [
  // MUST run first: any {{n}} already present in the SOURCE text.
  // If this ran later it would re-capture the placeholders this
  // function itself just created, double-masking them so restore()
  // would hand back a literal "{{0}}" instead of the real citation.
  /\{\{\d+\}\}/g,
  // URLs and emails
  /https?:\/\/[^\s<>"')]+/gi,
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/gi,
  // "Section 303", "Sec. 173(1)(ii)", "u/s 420"
  /\b(?:section|sec\.?|u\/s)\s*\d+[A-Za-z]?(?:\([^)\s]{1,6}\))*/gi,
  // Act + number: "BNS 303", "BNSS 173(1)(ii)", "IPC 420"
  /\b(?:BNS|BNSS|IPC|CrPC|CPC)\s*\d+[A-Za-z]?(?:\([^)\s]{1,6}\))*/gi,
  // Act titles with a year: "Bharatiya Nyaya Sanhita, 2023"
  /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,6}\s+(?:Act|Sanhita|Adhiniyam|Code|Rules),?\s*\d{4}\b/g,
];

export interface MaskedText {
  masked: string;
  tokens: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built once: whole-word, case-insensitive alternation of protected terms,
// longest-first so "Zero FIR" wins over "FIR" and "BNSS" over "BNS".
const TERMS_PATTERN = new RegExp(
  `\\b(?:${[...PROTECTED_TERMS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})\\b`,
  "gi"
);

/**
 * Replaces every protected token with a {{n}} placeholder.
 * Returns the masked string plus the ordered original tokens.
 */
export function maskProtectedTerms(text: string): MaskedText {
  const tokens: string[] = [];

  const capture = (match: string): string => {
    // Reuse the same placeholder for an identical repeated token so the
    // model sees fewer distinct placeholders to preserve.
    const existing = tokens.indexOf(match);
    const index = existing === -1 ? tokens.push(match) - 1 : existing;
    return `{{${index}}}`;
  };

  let masked = text;
  for (const pattern of PROTECTED_PATTERNS) {
    masked = masked.replace(pattern, capture);
  }
  masked = masked.replace(TERMS_PATTERN, capture);

  return { masked, tokens };
}

/**
 * Restores {{n}} placeholders. Tolerates a model that dropped,
 * duplicated, or added spaces inside a placeholder — anything it
 * cannot resolve is left untouched rather than corrupted.
 */
export function restoreProtectedTerms(text: string, tokens: string[]): string {
  if (tokens.length === 0) return text;

  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, rawIndex: string) => {
    const index = Number(rawIndex);
    return Number.isInteger(index) && index >= 0 && index < tokens.length
      ? tokens[index]
      : whole;
  });
}

/**
 * True when a string carries no translatable language — pure
 * numbers, punctuation, symbols, or a lone character. Skipping
 * these avoids pointless model calls and stops the translator
 * from "creatively" rewriting things like "•", "1.", or "₹4,500".
 */
export function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  // Must contain at least two consecutive letters in some script.
  return /\p{L}{2,}/u.test(trimmed);
}
