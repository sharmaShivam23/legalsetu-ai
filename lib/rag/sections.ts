// ==========================================================
// LegalSetu — Statute section detection
// ----------------------------------------------------------
// Citation accuracy is the whole point of this app, and a
// chunk is only citable if we know which section it came from.
//
// Indian bare acts print sections as a number, a full stop,
// then the marginal heading, e.g.
//
//     303. Theft.—Whoever, intending to take dishonestly...
//     "63. Rape.—A man is said to commit rape if he—"
//
// These helpers recognise that shape so the ingestion pipeline
// can split on real section boundaries and label every chunk,
// instead of cutting mid-sentence with no idea what it is.
// ==========================================================

/**
 * A section heading at the start of a line: number, full stop,
 * then a capitalised heading. Deliberately strict — labelling a
 * chunk with the wrong section is worse than labelling nothing.
 */
const SECTION_HEADING = /(?:^|\n)\s*(\d{1,3}[A-Z]?)\.\s+(?=[A-Z“"(])/g;

/** Same shape, but allowed to appear mid-line (PDF text often loses newlines). */
const SECTION_INLINE = /(?:^|[\s.—-])(\d{1,3}[A-Z]?)\.\s+(?=[A-Z][a-z])/g;

export interface StatuteSection {
  section: string;
  text: string;
}

/**
 * Best-effort recovery of the section number a chunk belongs to.
 * Returns null when nothing convincing is present, which makes the
 * grounding prompt describe the offence without citing a number.
 */
export function extractSectionNumber(text: string): string | null {
  if (!text) return null;

  // Prefer a heading that starts a line — the strongest signal.
  const heading = new RegExp(SECTION_HEADING.source, "g").exec(text);
  if (heading?.[1]) return heading[1];

  // Fall back to an inline heading, but only within the first part of
  // the chunk: a number appearing late is usually a cross-reference to
  // some other section, not this chunk's own heading.
  const head = text.slice(0, 300);
  const inline = new RegExp(SECTION_INLINE.source, "g").exec(head);
  if (inline?.[1]) return inline[1];

  return null;
}

/**
 * Splits a bare act into one entry per section.
 *
 * This is what ingestion should use for statutes: each chunk then
 * carries its own section number and starts at a real boundary,
 * so the model can cite "Section 303" and mean it. Falls back to
 * returning the whole text as a single unlabelled entry when the
 * document has no recognisable section headings.
 */
export function splitIntoSections(rawText: string): StatuteSection[] {
  const text = rawText.replace(/\r\n/g, "\n");
  const matches: { section: string; index: number }[] = [];

  const pattern = new RegExp(SECTION_HEADING.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // Offset to where the number itself starts, not the preceding newline.
    matches.push({ section: match[1], index: match.index + match[0].indexOf(match[1]) });
  }

  if (matches.length === 0) {
    const trimmed = text.trim();
    return trimmed ? [{ section: "", text: trimmed }] : [];
  }

  const sections: StatuteSection[] = [];

  // Preamble before the first section (long title, enacting formula).
  const preamble = text.slice(0, matches[0].index).trim();
  if (preamble.length > 200) sections.push({ section: "", text: preamble });

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body) sections.push({ section: matches[i].section, text: body });
  }

  return sections;
}

/**
 * Very long sections are split further so a single chunk never
 * swamps the retrieval context, while every piece keeps the same
 * section label.
 */
export function chunkStatute(
  rawText: string,
  maxChars = 1800
): StatuteSection[] {
  const out: StatuteSection[] = [];

  for (const entry of splitIntoSections(rawText)) {
    if (entry.text.length <= maxChars) {
      out.push(entry);
      continue;
    }

    // Split on sentence boundaries so pieces stay readable.
    const sentences = entry.text.split(/(?<=[.;])\s+(?=[A-Z(])/);
    let buffer = "";
    for (const sentence of sentences) {
      if (buffer && (buffer + " " + sentence).length > maxChars) {
        out.push({ section: entry.section, text: buffer.trim() });
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer.trim()) out.push({ section: entry.section, text: buffer.trim() });
  }

  return out;
}
