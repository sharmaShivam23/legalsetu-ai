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
 */
export function extractClauses(buffer: string): SentenceSplit {
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
    } else if (!isSentenceEnd && candidate.length >= MIN_CLAUSE_CHARS) {
      clauses.push(candidate);
      pending = "";
    } else {
      // Too short — carry forward and merge with the next chunk.
      pending = candidate + " ";
    }
  }

  return { sentences: clauses, rest: (pending + buffer.slice(cursor)).replace(/^\s+/, "") };
}
