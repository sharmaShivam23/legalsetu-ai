// ==========================================================
// LegalSetu — preparing streamed answers for speech
// ----------------------------------------------------------
// The assistant writes Markdown: headings, tables, bullet lists,
// citation markers and (in case mode) a Mermaid flowchart. Read
// aloud verbatim that becomes "hash hash Answer pipe Section pipe
// three-oh-three pipe graph T D", which is unusable.
//
// So two jobs live here, both pure and therefore testable:
//   toSpeakable  — reduce Markdown to plain prose worth hearing
//   extractSentences — pull finished sentences out of a growing
//                      buffer so each one can be synthesised while
//                      the rest of the answer is still streaming
// ==========================================================

/** Shortest fragment worth sending to the synthesiser on its own. */
const MIN_SENTENCE_CHARS = 12;

/**
 * Strips Markdown structure that has no spoken equivalent. Fenced
 * blocks (Mermaid diagrams, code) and tables are dropped outright
 * rather than flattened — a table read cell by cell is noise.
 */
export function toSpeakable(markdown: string): string {
  let text = markdown;

  // Fenced blocks, including the flowchart in a case report.
  text = text.replace(/```[\s\S]*?```/g, " ");
  // An unterminated fence: everything from it onward is still arriving.
  text = text.replace(/```[\s\S]*$/g, " ");

  // Table rows and their separator lines.
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^\|/.test(t)) return false;
      if (/^[:\-\s|]+$/.test(t) && t.includes("-") && t.length > 3) return false;
      return true;
    })
    .join("\n");

  text = text
    // Images, then links -> keep the label only.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Bare citation markers like [1] or [2, 3].
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, " ")
    // Heading hashes and blockquote marks.
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    // List bullets and numbering.
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    // Emphasis, inline code, strikethrough.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    // Horizontal rules and leftover pipes.
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/\|/g, " ");

  // Collapse whitespace, but keep sentence breaks at paragraph ends.
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(". ")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

export interface SentenceSplit {
  /** Complete sentences, ready to synthesise. */
  sentences: string[];
  /** The unfinished tail to carry into the next call. */
  rest: string;
}

/**
 * Splits a growing buffer at sentence ends — full stop, question and
 * exclamation marks, and the Devanagari danda "।" used across Indian
 * scripts. A fragment below MIN_SENTENCE_CHARS is held back and joined
 * to the next one, so "Yes." does not become its own audio clip and an
 * abbreviation mid-sentence does not split it.
 */
export function extractSentences(buffer: string): SentenceSplit {
  const sentences: string[] = [];
  let pending = "";
  let cursor = 0;

  const boundary = /[.!?।॥]+[\s"')\]]*/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(buffer)) !== null) {
    const end = match.index + match[0].length;
    const candidate = (pending + buffer.slice(cursor, end)).trim();
    cursor = end;

    if (candidate.length < MIN_SENTENCE_CHARS) {
      pending = candidate + " ";
      continue;
    }
    sentences.push(candidate);
    pending = "";
  }

  return { sentences, rest: (pending + buffer.slice(cursor)).replace(/^\s+/, "") };
}

/**
 * Minimum fragment length for clause-level splitting. Shorter fragments
 * sound choppy and waste TTS round-trips; longer ones delay first audio.
 * 40 chars is roughly one spoken clause of 2–3 seconds.
 */
const MIN_CLAUSE_CHARS = 40;

/**
 * Voice-mode variant of extractSentences that splits more aggressively
 * at clause boundaries — commas, semicolons, colons, and em-dashes —
 * so TTS starts speaking after the FIRST clause rather than waiting for
 * a full sentence. Falls through to sentence-level splitting for short
 * fragments so "Yes." doesn't become its own audio clip.
 *
 * The key difference from extractSentences: a comma after 40+ chars of
 * accumulated text triggers a split, getting audio to the speaker
 * roughly half a sentence sooner on every single turn.
 *
 * `minClauseChars` lets a caller ask for a shorter FIRST clause than the
 * rest. Time-to-first-audio is the number a listener actually feels —
 * until it lands they are sitting in silence wondering whether anything
 * is happening — whereas later clauses are synthesised while earlier
 * ones are still playing and their length costs nothing.
 */
export function extractClauses(
  buffer: string,
  minClauseChars = MIN_CLAUSE_CHARS,
  /**
   * When set and NO clause boundary has produced anything yet, a pending
   * run longer than this is cut at its last word break. Meant for the
   * first clip only: a long opening sentence with no comma otherwise has
   * to be synthesised whole (measured: ~9s of audio, ~3s to synthesise)
   * before the listener hears a single word.
   */
  forceSplitChars?: number
): SentenceSplit {
  const clauses: string[] = [];
  let pending = "";
  let cursor = 0;

  // Match sentence-ending punctuation AND clause-level punctuation.
  // Sentence enders: . ! ? । ॥
  // Clause separators: , ; : — (em-dash U+2014)
  const boundary = /[.!?।॥,;:\u2014]+[\s"')\]]*/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(buffer)) !== null) {
    const end = match.index + match[0].length;
    const candidate = (pending + buffer.slice(cursor, end)).trim();
    cursor = end;

    const isSentenceEnd = /[.!?।॥]/.test(match[0]);

    // Always split at sentence ends if we have enough text.
    // For clause separators, only split if the accumulated text
    // is long enough to be worth synthesising on its own.
    if (isSentenceEnd && candidate.length >= MIN_SENTENCE_CHARS) {
      clauses.push(candidate);
      pending = "";
    } else if (!isSentenceEnd && candidate.length >= minClauseChars) {
      clauses.push(candidate);
      pending = "";
    } else {
      // Too short — carry forward and merge with the next chunk.
      pending = candidate + " ";
    }
  }

  let rest = (pending + buffer.slice(cursor)).replace(/^\s+/, "");

  if (forceSplitChars && clauses.length === 0 && rest.length > forceSplitChars) {
    const cut = rest.lastIndexOf(" ", forceSplitChars);
    if (cut >= minClauseChars) {
      clauses.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1);
    }
  }

  return { sentences: clauses, rest };
}

// ----------------------------------------------------------
// Which voice should read this text?
// ----------------------------------------------------------
// The reply language is decided before the answer exists, but the model
// does not always obey it: with Hindi earlier in a conversation, an
// English request was answered in Hindi — and an English voice then read
// Devanagari aloud as gibberish. The text's own script is the ground truth
// for which voice can pronounce it.

/** Unicode block -> the app language whose voice reads that script. */
const SCRIPTS: { re: RegExp; lang: string; family: string[] }[] = [
  { re: /[ऀ-ॿ]/g, lang: "hi", family: ["hi", "mr", "mai", "bho", "sat"] },
  { re: /[ঀ-৿]/g, lang: "bn", family: ["bn", "as"] },
  { re: /[਀-੿]/g, lang: "pa", family: ["pa"] },
  { re: /[઀-૿]/g, lang: "gu", family: ["gu"] },
  { re: /[଀-୿]/g, lang: "or", family: ["or"] },
  { re: /[஀-௿]/g, lang: "ta", family: ["ta"] },
  { re: /[ఀ-౿]/g, lang: "te", family: ["te"] },
  { re: /[ಀ-೿]/g, lang: "kn", family: ["kn"] },
  { re: /[ഀ-ൿ]/g, lang: "ml", family: ["ml"] },
  { re: /[؀-ۿ]/g, lang: "ur", family: ["ur"] },
];

/**
 * The language to SPEAK `text` in. Keeps `fallback` whenever its voice can
 * read the text; switches only when another script clearly dominates.
 * Latin text inside an Indian-language reply ("BNS", "FIR") stays with the
 * reply's voice — those voices read English words — so a single answer is
 * never split across two voices for an acronym. Pure English text with an
 * Indian-language fallback is switched to English only when it contains no
 * Indian script at all and is a real sentence, not a stray term.
 */
export function speechLanguageFor(text: string, fallback: string): string {
  const base = (fallback || "en").split("-")[0].toLowerCase();
  let best: { lang: string; family: string[]; count: number } | null = null;
  for (const s of SCRIPTS) {
    const count = text.match(s.re)?.length ?? 0;
    if (count > (best?.count ?? 0)) best = { lang: s.lang, family: s.family, count };
  }
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;

  if (best && best.count >= latin) {
    return best.family.includes(base) ? base : best.lang;
  }
  // Mostly Latin script.
  if (base !== "en" && !best && latin >= 20) return "en";
  return base;
}
