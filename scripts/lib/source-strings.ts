// Harvests user-visible English copy from the source tree. Shared by
// scripts/warm-translations.ts and scripts/build-language-packs.ts.

import fs from "node:fs";
import path from "node:path";

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
export function extractFrom(source: string): string[] {
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

/** Every candidate UI string in app/, components/ and lib/, de-duplicated. */
export function collectSourceStrings(root: string = process.cwd()): { files: number; strings: string[] } {
  const files = SOURCE_DIRS.flatMap((d) => walk(path.resolve(root, d)));
  const strings = new Set<string>();
  for (const file of files) {
    for (const s of extractFrom(fs.readFileSync(file, "utf8"))) strings.add(s);
  }
  return { files: files.length, strings: [...strings] };
}
