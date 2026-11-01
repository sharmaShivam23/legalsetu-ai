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
import { collectSourceStrings } from "./lib/source-strings";

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

async function main(): Promise<void> {
  const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, languageName } = await import("../lib/i18n/languages");
  const { translateBatchDetailed } = await import("../lib/i18n/translator");

  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = (
    requested.length > 0
      ? requested
      : SUPPORTED_LANGUAGES.map((l) => l.code).filter((c) => c !== DEFAULT_LANGUAGE)
  ).filter((c) => c !== DEFAULT_LANGUAGE);

  const { files, strings: corpus } = collectSourceStrings();

  console.log(`Scanned ${files} source files`);
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
