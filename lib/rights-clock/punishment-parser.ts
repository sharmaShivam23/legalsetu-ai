// ==========================================================
// LegalSetu — Rights Clock: BNS punishment extraction
// ----------------------------------------------------------
// Every custody computation in the Rights Clock depends on one
// fact per offence: what is the maximum (and minimum) punishment?
// That fact is NOT typed in from memory. It is parsed out of the
// Bharatiya Nyaya Sanhita text already ingested into data/, so
// every number the engine uses can be traced back to the exact
// words of the Act, and the excerpt is shown to the user.
//
// The parser is deliberately conservative: a clause it cannot
// read with confidence (e.g. "punished with the punishment
// provided for that offence") is marked `resolvable: false`,
// and the engine refuses to compute a date from it rather than
// guessing.
// ==========================================================

export interface PunishmentProfile {
  /** Death is one of the punishments prescribed. */
  death: boolean;
  /** Imprisonment for life is one of the punishments prescribed. */
  life: boolean;
  /** Longest fixed term of imprisonment prescribed, in months (null if none / only life/death). */
  maxMonths: number | null;
  /**
   * Enhanced maximum that applies ONLY on a second or subsequent
   * conviction (e.g. BNS 303(2)). Kept apart from `maxMonths` because it
   * depends on a fact — a prior conviction — that most undertrials lack.
   */
  repeatMaxMonths: number | null;
  /** Mandatory minimum term in months, if the clause specifies one. */
  minMonths: number | null;
  /** Only fine / community service — no imprisonment at all. */
  nonCustodial: boolean;
  /** False when the clause punishes by reference to another offence and cannot be resolved alone. */
  resolvable: boolean;
  /** The punishment wording exactly as it appears in the Act (trimmed). */
  excerpt: string;
}

export interface ParsedSubsection {
  /** "1", "2" … or "" for a section with no numbered sub-sections. */
  sub: string;
  punishment: PunishmentProfile | null;
}

export interface ParsedSection {
  section: string;
  title: string;
  /** Aggregate over all sub-sections (gravest wins). Null if the section prescribes no punishment. */
  punishment: PunishmentProfile | null;
  subsections: ParsedSubsection[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty-one": 21, "twenty-four": 24, thirty: 30,
};

function wordToNumber(raw: string): number | null {
  const w = raw.toLowerCase().replace(/\s*-\s*/g, "-").trim();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? null;
}

/** "seven years" → 84, "six months" → 6, "twenty-four hours"/days → fraction of a month. */
function toMonths(qty: string, unit: string): number | null {
  const n = wordToNumber(qty);
  if (n === null) return null;
  const u = unit.toLowerCase();
  if (u.startsWith("year")) return n * 12;
  if (u.startsWith("month")) return n;
  if (u.startsWith("day")) return Math.round((n / 30) * 100) / 100;
  if (u.startsWith("hour")) return Math.round((n / (30 * 24)) * 1000) / 1000;
  return null;
}

const QTY = String.raw`(\d{1,2}|(?:twenty|thirty)\s*-\s*\w+|[a-z]+)`;
const UNIT = String.raw`(years?|months?|days?|hours?)`;

/**
 * Words the PDF extraction sometimes splits with a stray space
 * ("exten d", "m onths", "t erm", "convic ted"). Only words that
 * matter to punishment parsing are repaired, so ordinary text is
 * never rewritten.
 */
const REPAIR_WORDS = [
  "imprisonment", "punishable", "punished", "description", "conviction", "convicted", "either",
  "exceeding", "rigorous", "extended", "extend", "months", "month", "years", "year", "may",
  "days", "hours", "term", "life", "death", "less", "than", "fine",
  "seventeen", "fourteen", "thirteen", "eighteen", "nineteen", "fifteen", "sixteen",
  "twenty", "twelve", "eleven", "three", "seven", "eight", "thirty", "four", "five", "nine", "ten", "two", "one", "six",
];
const REPAIR_PATTERNS = REPAIR_WORDS.map((w) => ({
  word: w,
  // Exactly one optional space between any two letters; at least one
  // space must be present for the pattern to differ from the word.
  re: new RegExp(String.raw`\b${w.split("").join(String.raw`\s?`)}\b`, "gi"),
}));

export function repairSplitWords(text: string): string {
  let out = text.replace(/\bt\s+o\b/g, "to");
  for (const { word, re } of REPAIR_PATTERNS) {
    out = out.replace(re, (m) => (m.includes(" ") ? word : m));
  }
  return out;
}

/** Non-breaking space, built from its code so no editor can turn it into a literal. */
const NBSP = new RegExp(String.fromCharCode(0xa0), "g");

/** Normalises the PDF-extracted spacing quirks ("( 1 )", "–  –", curly quotes). */
export function normalise(text: string): string {
  return text
    .replace(NBSP, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*-\s*(?=[a-z])/g, (m) => (/\s/.test(m) ? "-" : m))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds every punishment clause in a block of statute text — the words
 * following "shall be punished with" / "punishable with" up to the end
 * of that sentence.
 */
export function findPunishmentClauses(text: string): string[] {
  return findPunishmentClauseSpans(text).map((s) => s.clause);
}

export interface ClauseSpan {
  clause: string;
  /** True when the clause is the enhanced punishment for a repeat conviction. */
  repeatOnly: boolean;
}

const REPEAT_MARKER = /second\s+or\s+subsequent\s+conviction/i;

/** Like findPunishmentClauses, but also reports whether each clause is a repeat-conviction enhancement. */
export function findPunishmentClauseSpans(text: string): ClauseSpan[] {
  // Page numbers can land inside the trigger itself ("shall be 43
  // punished with"), so they are stripped before searching.
  const t = normalise(stripPageNumbers(repairSplitWords(normalise(text))));
  const spans: ClauseSpan[] = [];
  // "\bbe punished with" also catches "shall, where no express provision
  // is made …, be punished with" (BNS 62).
  const trigger = /(\bbe\s+punish(?:ed|able)\s+(?:on\s+(?:the\s+)?first\s+conviction\s+)?with|shall\s+be\s+punished\s+(?:for|as)|is\s+punishable\s+with)/gi;
  let m: RegExpExecArray | null;
  while ((m = trigger.exec(t))) {
    const rest = t.slice(m.index, m.index + 900);
    // A sentence ends at ". " followed by a sub-clause marker, a capital
    // letter, or an Explanation/Illustration heading.
    const end = rest.search(/\.\s+(?=\(|[A-Z]|$)|\.$|;\s*(?:or|and)?\s*\(\s*[a-z]\s*\)/);
    // The words just before the trigger — back to the previous sentence
    // or clause boundary — say whether this is the repeat-offence clause
    // ("… on a second or subsequent conviction, shall be punished …").
    const lead = t.slice(Math.max(0, m.index - 200), m.index);
    const leadSentence = lead.split(/[.;:]\s/).pop() ?? lead;
    spans.push({
      clause: (end === -1 ? rest : rest.slice(0, end + 1)).trim(),
      repeatOnly: REPEAT_MARKER.test(leadSentence),
    });
  }
  return spans;
}

/** Parses a clause span, folding a repeat-only clause into `repeatMaxMonths`. */
export function parseClauseSpan(span: ClauseSpan): PunishmentProfile {
  const p = parsePunishmentClause(span.clause);
  if (!span.repeatOnly) return p;
  return {
    ...p,
    death: false,
    life: false,
    maxMonths: null,
    minMonths: null,
    repeatMaxMonths: p.maxMonths ?? p.repeatMaxMonths,
    nonCustodial: false,
    // A repeat clause never decides the ordinary punishment on its own.
    resolvable: true,
  };
}

/**
 * The source text was extracted from a paginated PDF, so printed page
 * numbers sit in the middle of sentences ("imprisonment 95 for life").
 * Inside a punishment clause, a bare 1–3 digit number is never part of
 * the sentence unless it is a section reference or a quantity, so those
 * are kept and every other bare number is dropped.
 */
export function stripPageNumbers(text: string): string {
  return text.replace(
    /(\b(?:sections?|sub-sections?|clause|Rs\.?|and|or|to)\s+)?\b(\d{1,3})\b(?!\s*(?:\)|years?|months?|days?|hours?|of\s+(?:this|the)\b))/gi,
    (match, keepPrefix: string | undefined) => (keepPrefix ? match : "")
  );
}

/** Reads one punishment clause into a structured profile. */
export function parsePunishmentClause(clause: string): PunishmentProfile {
  const c = repairSplitWords(normalise(clause));
  const full = normalise(stripPageNumbers(c)).toLowerCase();

  // Split off the enhanced punishment for repeat convictions, which only
  // applies when the accused already has a conviction for this offence.
  const repeatIdx = full.search(/(?:,\s*|\band\s+)?(?:in\s+(?:the\s+)?case\s+of|on)\s+(?:a\s+)?second\s+or\s+subsequent\s+conviction/);
  const lower = repeatIdx === -1 ? full : full.slice(0, repeatIdx);
  const repeatPart = repeatIdx === -1 ? "" : full.slice(repeatIdx);

  const death = /\bwith\s+death\b|\bdeath\s*,?\s+or\s+(?:with\s+)?imprisonment|\bpunish(?:ed|able)\s+with\s+death/.test(lower);
  // Note: `life` is read from the base clause only — an enhanced repeat
  // punishment is recorded separately below.
  const life = /imprisonment\s+for\s+life|extend\s+to\s+(?:imprisonment\s+for\s+)?(?:the\s+remainder|life)\b/.test(lower);

  const maxTermIn = (text: string): number | null => {
    let best: number | null = null;
    const patterns = [
      // "may extend to seven years", "may be extended to fourteen years",
      // "may extend to imprisonment for ten years"
      String.raw`(?:may|shall)\s+(?:be\s+)?extend(?:ed)?\s+to\s+(?:imprisonment\s+for\s+)?${QTY}\s+${UNIT}`,
      // "for a term not exceeding six months"
      String.raw`not\s+exceeding\s+${QTY}\s+${UNIT}`,
      // "imprisonment … for a term of seven years" (fixed term)
      String.raw`imprisonment[^.;]{0,40}?for\s+a\s+term\s+of\s+${QTY}\s+${UNIT}`,
    ];
    for (const src of patterns) {
      for (const m of text.matchAll(new RegExp(src, "gi"))) {
        const months = toMonths(m[1], m[2]);
        if (months !== null) best = Math.max(best ?? 0, months);
      }
    }
    return best;
  };

  const maxMonths = maxTermIn(lower);
  const repeatMax = repeatPart ? maxTermIn(repeatPart) : null;
  const repeatMaxMonths = repeatMax !== null && repeatMax > (maxMonths ?? 0) ? repeatMax : null;

  let minMonths: number | null = null;
  const minRe = new RegExp(String.raw`not\s+(?:be\s+)?less\s+than\s+${QTY}\s+${UNIT}`, "gi");
  for (const m of lower.matchAll(minRe)) {
    const months = toMonths(m[1], m[2]);
    if (months !== null) minMonths = Math.max(minMonths ?? 0, months);
  }

  const mentionsImprisonment = /imprisonment/.test(lower);
  const nonCustodial =
    !death && !life && !mentionsImprisonment && /\bfine\b|community\s+service/.test(lower);

  // Punishment defined by reference to another offence ("the punishment
  // provided for that offence", "one-half of the longest term") cannot be
  // resolved from this clause alone.
  // Punishment defined by reference to another offence ("the punishment
  // provided for that offence", "one-half of the longest term", "in
  // addition to the punishment provided …") cannot be resolved from this
  // clause alone. Such a clause is ALWAYS unresolvable — a guessed number
  // here would become a wrong release date.
  const byReference =
    /punishment\s+provided\s+for|provided\s+for\s+(?:that|the|such)\s+offence|in\s+the\s+same\s+manner|longest\s+term|one\s*-\s*(?:half|third|fourth|quarter)\s+of|same\s+punishment|punished\s+as\s+if|punished\s+as\s+(?:a|an|the)\b|punishment\s+(?:prescribed|specified)\s+for|in\s+addition\s+to\s+the\s+punishment|description\s+provided\s+for/.test(lower);

  const hasTerm = maxMonths !== null || life || death;
  const resolvable = !byReference && (nonCustodial || hasTerm);

  return {
    death,
    life,
    maxMonths,
    repeatMaxMonths,
    minMonths,
    nonCustodial,
    resolvable,
    excerpt: c.length > 600 ? c.slice(0, 597) + "…" : c,
  };
}

/** Severity order: death > life > longer term > shorter term > non-custodial. */
export function severity(p: PunishmentProfile): number {
  if (p.death) return 1_000_000;
  if (p.life) return 100_000;
  if (p.maxMonths !== null) return p.maxMonths;
  return 0;
}

/** Combines several clauses (or sub-sections) into one gravest-case profile. */
export function combineProfiles(profiles: PunishmentProfile[]): PunishmentProfile | null {
  const usable = profiles.filter(Boolean);
  if (usable.length === 0) return null;
  const gravest = [...usable].sort((a, b) => severity(b) - severity(a))[0];
  const maxTerms = usable.map((p) => p.maxMonths).filter((v): v is number => v !== null);
  const repeatTerms = usable.map((p) => p.repeatMaxMonths).filter((v): v is number => v !== null);
  return {
    death: usable.some((p) => p.death),
    life: usable.some((p) => p.life),
    maxMonths: maxTerms.length ? Math.max(...maxTerms) : null,
    repeatMaxMonths: repeatTerms.length ? Math.max(...repeatTerms) : null,
    // A mandatory minimum only binds the gravest clause it belongs to.
    minMonths: gravest.minMonths,
    nonCustodial: usable.every((p) => p.nonCustodial),
    resolvable: usable.every((p) => p.resolvable),
    excerpt: gravest.excerpt,
  };
}

const SECTION_HEADER =
  /(?:^|\s)(\d{1,3})\.\s+(?:[—–-]+\s*)?([A-Z][^—–]{1,260}?)\s*(?:—|–\s*–|––)/g;

/**
 * Splits the Act's body into sections. Section numbers must appear in
 * strictly increasing order (1, 2, 3 …), which rejects the many false
 * positives inside the text ("… under section 64. Explanation —").
 */
export function splitSections(actText: string): { section: string; title: string; text: string }[] {
  const startMarker = actText.search(/CHAPTER\s+I\s+PRELIMINARY\s+1\.\s+Short title,\s+commencement and application\.\s*(?:—|–|-)/);
  const body = startMarker === -1 ? actText : actText.slice(startMarker);

  const heads: { n: number; title: string; idx: number }[] = [];
  let expected = 1;
  const re = new RegExp(SECTION_HEADER.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const n = Number(m[1]);
    if (n === expected) {
      heads.push({
        n,
        // "C riminal conspiracy" → "Criminal conspiracy": the PDF split a
        // title's initial capital. Only the leading letter is rejoined, so
        // ordinary words ("A person") are never merged.
        title: m[2].trim().replace(/\.$/, "").replace(/^([A-Z]) (?=[a-z]{3,})/, "$1"),
        idx: m.index,
      });
      expected++;
    } else {
      // Rewind so a false match cannot swallow the next real header.
      re.lastIndex = m.index + 2;
    }
  }

  return heads.map((h, i) => ({
    section: String(h.n),
    title: h.title,
    text: body.slice(h.idx, heads[i + 1]?.idx ?? body.length),
  }));
}

/** Splits a section's text into numbered sub-sections "( 1 )", "( 2 )" … */
export function splitSubsections(sectionText: string): { sub: string; text: string }[] {
  const re = /\(\s*(\d{1,2})\s*\)/g;
  const marks: { n: number; idx: number }[] = [];
  let expected = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionText))) {
    // A real sub-section marker opens a sentence ("— ( 1 ) Whoever",
    // "fine. ( 2 ) Whoever"). A cross-reference such as "sub-section
    // ( 1 ) of section 2" does not, and must not split the section.
    const lead = sectionText.slice(Math.max(0, m.index - 3), m.index).trim();
    const opensSentence = lead === "" || /[.:;—–-]$/.test(lead);
    if (opensSentence && Number(m[1]) === expected) {
      marks.push({ n: expected, idx: m.index });
      expected++;
    }
  }
  if (marks.length === 0) return [{ sub: "", text: sectionText }];
  return marks.map((mk, i) => ({
    sub: String(mk.n),
    text: sectionText.slice(mk.idx, marks[i + 1]?.idx ?? sectionText.length),
  }));
}

/** Full pipeline: Act text → per-section, per-sub-section punishment profiles. */
export function parseAct(actText: string): ParsedSection[] {
  return splitSections(actText).map(({ section, title, text }) => {
    // Footnotes / chapter headings that trail the last sub-section would
    // otherwise be read as part of it.
    const clean = text.replace(/\s+CHAPTER\s+[IVXLC]+\s+[A-Z ,]+$/, "");
    const subsections = splitSubsections(clean).map(({ sub, text: subText }) => {
      const clauses = findPunishmentClauseSpans(subText).map(parseClauseSpan);
      return { sub, punishment: combineProfiles(clauses) };
    });
    return {
      section,
      title,
      punishment: combineProfiles(
        subsections.map((s) => s.punishment).filter((p): p is PunishmentProfile => p !== null)
      ),
      subsections,
    };
  });
}
