/**
 * LegalSetu — translation cache warmer
 * ------------------------------------------------------------
 *     npm run i18n:warm              # every supported language
 *     npm run i18n:warm -- hi mr ta  # only these
 *
 * Harvests the user-visible strings out of the source tree and pushes
 * them through the normal translation path once, so they land in the
 * Postgres TranslationCache before any user asks for them.
 *
 * Why this exists
 * ---------------
 * Translation is correct but not fast: a cold page of ~150 strings costs
 * about 35 seconds, because the model has to generate every translation.
 * The same page served from cache costs about 75 milliseconds. Nothing
 * about the runtime path needs to change — the cache simply has to be
 * warm, and "warm" is a thing you can do on purpose the night before
 * rather than something you hope happened during testing.
 *
 * Run it once per language after any significant UI copy change. The
 * cache is shared across all users and survives restarts, so a string
 * translated here is free for everyone, forever.
 *
 * On extraction
 * -------------
 * This walks the source rather than a running browser on purpose: it
 * needs no server, no login and no headless Chrome, and it reaches copy
 * on pages behind authentication that a crawler would miss. It will
 * over-collect a little (a few strings that never render). That is the
 * right way to be wrong — a wasted cache row costs nothing, whereas a
 * missed string costs a visible stall in front of an audience.
 */

import fs from "node:fs";
import path from "node:path";

const NEWLINE = new RegExp(String.fromCharCode(13) + "?" + String.fromCharCode(10));

function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(NEWLINE)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = new Set([".tsx", ".ts"]);

/** Directories whose strings never reach a user. */
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "tests", "scripts"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Code that merely looks like text is the whole problem here. The JSX
 * text pattern (>...<) cannot tell a real text node from the gap between
 * two TypeScript generics — `useState<Phase>("starting"); const x = ...`
 * reads as ">...<" just as much as `<p>Hello there</p>` does.
 *
 * So the filter is deliberately strict. A false negative costs one
 * uncached string; a false positive costs a model call, a junk cache row,
 * and a nonsense "translation" of a line of TypeScript.
 */
const CODE_WORDS =
  /\b(const|let|var|function|return|async|await|import|export|interface|type|extends|implements|useState|useRef|useEffect|useCallback|useMemo|Promise|Array|Record|null|undefined|props|className|onClick|true|false)\b/;

function looksLikeUserCopy(text: string): boolean {
  const value = text.trim();
  if (value.length < 4 || value.length > 300) return false;

  // Copy starts with a word, not punctuation or a bracket.
  if (!/^[A-Za-z0-9À-ɏ]/.test(value)) return false;

  // At least two words, and a run of letters somewhere.
  if (!/\s/.test(value)) return false;
  if (!/[A-Za-z]{2,}/.test(value)) return false;

  // Already non-Latin: either pre-translated or not English to begin with.
  if (/[ऀ-෿؀-ۿ]/.test(value)) return false;

  // Punctuation that essentially never appears in UI copy but is
  // everywhere in source. Apostrophes are allowed ("don't"), double
  // quotes and code brackets are not.
  if (/[<>{}()[\];=|&`"\\]/.test(value)) return false;
  if (/\/\/|\/\*|=>|::|\$\{/.test(value)) return false;

  // Identifiers and keywords.
  if (CODE_WORDS.test(value)) return false;
  if (/[a-z][A-Z]/.test(value.replace(/\s+/g, ""))) {
    // camelCase inside a single token is an identifier, not a sentence.
    if (value.split(/\s+/).some((t) => /^[a-z]+[A-Z]/.test(t))) return false;
  }

  // Paths, URLs, file names.
  if (/^[./@#]|https?:|\.(tsx?|json|css|png|svg)\b/.test(value)) return false;

  // Tailwind class soup: mostly lowercase-dash tokens.
  const tokens = value.split(/\s+/);
  const classy = tokens.filter((t) => /^[a-z0-9:_\-/.%]+$/.test(t)).length;
  if (tokens.length >= 3 && classy / tokens.length > 0.7) return false;

  // Needs a lowercase letter: SCREAMING_CASE is a constant.
  if (!/[a-z]/.test(value)) return false;

  // Must read like prose: at least half the tokens are plain words.
  const wordy = tokens.filter((t) => /^[A-Za-z][A-Za-z'’-]*[.,!?:]?$/.test(t)).length;
  if (wordy / tokens.length < 0.6) return false;

  return true;
}

/** Pulls candidate copy out of one source file. */
function extractFrom(source: string): string[] {
  const found: string[] = [];

  // 1. JSX text nodes: >Some words here<
  for (const m of source.matchAll(/>([^<>{}\n][^<>{}]{3,300})</g)) {
    found.push(m[1]);
  }

  // 2. User-visible JSX attributes.
  const attrs = "placeholder|title|alt|aria-label|label|description|heading|subtitle|emptyText|tooltip";
  for (const m of source.matchAll(new RegExp(`(?:${attrs})\\s*=\\s*"([^"]{4,300})"`, "g"))) {
    found.push(m[1]);
  }
  for (const m of source.matchAll(new RegExp(`(?:${attrs})\\s*:\\s*"([^"]{4,300})"`, "g"))) {
    found.push(m[1]);
  }

  // 3. Strings handed to the user through toasts and thrown errors.
  for (const m of source.matchAll(/toast\.\w+\(\s*"([^"]{6,300})"/g)) found.push(m[1]);
  for (const m of source.matchAll(/apiError\(\s*"[A-Z_]+"\s*,\s*"([^"]{6,300})"/g)) found.push(m[1]);

  return found
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(looksLikeUserCopy);
}

async function main(): Promise<void> {
  const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, languageName } = await import("../lib/i18n/languages");
  const { translateBatchDetailed } = await import("../lib/i18n/translator");

  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = (
    requested.length > 0
      ? requested
      : SUPPORTED_LANGUAGES.map((l) => l.code).filter((c) => c !== DEFAULT_LANGUAGE)
  ).filter((c) => c !== DEFAULT_LANGUAGE);

  const files = SOURCE_DIRS.flatMap((d) => walk(path.resolve(process.cwd(), d)));
  const strings = new Set<string>();
  for (const file of files) {
    for (const s of extractFrom(fs.readFileSync(file, "utf8"))) strings.add(s);
  }
  const corpus = [...strings];

  console.log(`Scanned ${files.length} source files`);
  console.log(`Found ${corpus.length} unique user-visible strings`);

  // --list prints the harvested copy and stops, so the extraction
  // heuristic can be eyeballed without spending a single model call.
  if (process.argv.includes("--list")) {
    for (const s of corpus.slice().sort()) console.log(`  | ${s}`);
    return;
  }

  console.log(`Warming ${targets.length} language(s): ${targets.join(", ")}\n`);

  if (corpus.length === 0) {
    console.log("Nothing to warm.");
    return;
  }

  let failures = 0;
  for (const target of targets) {
    const started = Date.now();
    process.stdout.write(`  ${languageName(target).padEnd(12)} ${target.padEnd(4)} ... `);
    try {
      const { translations, degraded } = await translateBatchDetailed(corpus, target);
      const changed = translations.filter((t, i) => t !== corpus[i]).length;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const flag = degraded ? "  DEGRADED (provider failed on some batches)" : "";
      console.log(`${changed}/${corpus.length} in ${seconds}s${flag}`);
      if (degraded) failures += 1;
    } catch (err) {
      failures += 1;
      console.log(`FAILED: ${String((err as any)?.message ?? err).slice(0, 90)}`);
    }
  }

  console.log(
    failures === 0
      ? "\nDone. Every language is cached — switching is now a database read."
      : `\nDone with ${failures} degraded language(s). Re-run to fill the gaps; cached strings are skipped.`
  );
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
