/**
 * LegalSetu — build the static language packs
 * ------------------------------------------------------------
 *     npm run dev                          # in another terminal
 *     npm run i18n:packs                   # every language
 *     npm run i18n:packs -- hi ta bn       # only these
 *     npm run i18n:packs -- --no-crawl     # source scan only (no app needed)
 *     npm run i18n:packs -- --reuse-corpus ur  # redo a language using the
 *                                          # strings already in the packs
 *
 * Writes public/i18n/<lang>.json — every interface string, already
 * translated. The browser loads ONE of these files when the language
 * changes and translates the whole page from it instantly: no database,
 * no API key, no rate limit. Commit the files; Vercel serves them from
 * its CDN like any image.
 *
 * Why packs instead of the old database warm-up
 * ---------------------------------------------
 * The warm-up filled the LOCAL Postgres cache only. A Vercel deployment
 * has its own (empty) database, so there every page was translated live,
 * string by string, through rate-limited APIs: ~30 minutes per language.
 *
 * Where the strings come from
 * ---------------------------
 * 1. The source scan (scripts/lib/source-strings.ts).
 * 2. A real-browser crawl of every page in English, collecting text with
 *    the SAME function the live translator uses (lib/i18n/dom.ts). This
 *    matters: measured against real usage, the source scan alone found
 *    only 25% of the text people actually see — the rest is assembled
 *    at runtime.
 * The crawl signs in as a throwaway account, so no real user's data can
 * end up in a pack. The translation cache is deliberately NOT exported:
 * it holds users' own messages and complaint text, and these files are
 * public.
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

const BASE = (process.env.PACK_CRAWL_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = path.resolve(process.cwd(), "public", "i18n");

const PUBLIC_ROUTES = ["/", "/login", "/register", "/forgot-password"];
const APP_ROUTES = [
  "/dashboard",
  "/dashboard/chat",
  "/dashboard/cases",
  "/dashboard/documents",
  "/dashboard/fir",
  "/dashboard/history",
  "/dashboard/lawyer",
  "/dashboard/settings",
  "/dashboard/sources",
];

const CRAWL_USER = {
  email: "language-pack-builder@legalsetu.local",
  password: `PackBuilder!${Date.now()}`,
  name: "Pack Builder",
};

/** The page's own collector, bundled for the browser. */
async function bundleCollector(): Promise<string> {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    entryPoints: [path.resolve(process.cwd(), "lib/i18n/dom.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "__lsDom",
    platform: "browser",
    target: "es2020",
  });
  return out.outputFiles[0].text;
}

async function crawl(): Promise<string[]> {
  const { chromium } = await import("@playwright/test");
  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const prisma = new PrismaClient();

  const collector = await bundleCollector();
  const found = new Set<string>();

  await prisma.user.upsert({
    where: { email: CRAWL_USER.email },
    update: { passwordHash: await bcrypt.hash(CRAWL_USER.password, 10), emailVerified: new Date() },
    create: {
      email: CRAWL_USER.email,
      name: CRAWL_USER.name,
      passwordHash: await bcrypt.hash(CRAWL_USER.password, 10),
      emailVerified: new Date(),
    },
  });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // English in, so every string is the English source.
    await context.addCookies([{ name: "ls_lang", value: "en", domain: new URL(BASE).hostname, path: "/" }]);
    await context.addInitScript(() => {
      try {
        localStorage.setItem("ls_lang", "en");
      } catch {}
    });
    const page = await context.newPage();

    const harvest = async (label: string) => {
      await page.addScriptTag({ content: collector });
      const strings: string[] = await page.evaluate(() => {
        const dom = (window as any).__lsDom;
        const r = dom.collectTranslatable(document.body);
        return [...r.texts.map((t: any) => t.source), ...r.attrs.map((a: any) => a.source)];
      });
      let added = 0;
      for (const s of strings) {
        // Nothing that names the throwaway account.
        if (s.includes(CRAWL_USER.name) || s.includes(CRAWL_USER.email)) continue;
        if (!found.has(s)) {
          found.add(s);
          added++;
        }
      }
      console.log(`  ${label.padEnd(32)} +${added}`);
    };

    const visit = async (route: string) => {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90_000 });
        await page.waitForTimeout(800);
        await harvest(route);
      } catch (err) {
        console.log(`  ${route.padEnd(32)} skipped (${String(err).slice(0, 60)})`);
      }
    };

    for (const route of PUBLIC_ROUTES) await visit(route);

    // Sign in through the real form.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90_000 });
    await page.fill('input[type="email"]', CRAWL_USER.email);
    await page.fill('input[type="password"]', CRAWL_USER.password);
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 60_000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    if (!page.url().includes("/dashboard")) {
      console.log("  (sign-in failed — signed-in pages skipped)");
    } else {
      for (const route of APP_ROUTES) await visit(route);

      // Text that only appears after interaction on the chat page: each
      // mode's placeholder and empty state, and the model picker.
      await page.goto(`${BASE}/dashboard/chat`, { waitUntil: "networkidle", timeout: 90_000 });
      for (const mode of ["Quick Answer", "Know the Law", "Generate FIR", "Case Analysis"]) {
        const button = page.getByRole("radio", { name: new RegExp(mode, "i") }).first();
        if (await button.count()) {
          await button.click().catch(() => {});
          await page.waitForTimeout(400);
          await harvest(`chat: ${mode}`);
        }
      }
      const picker = page.getByRole("button", { name: /Auto \(Best Available\)/ }).first();
      if (await picker.count()) {
        await picker.click().catch(() => {});
        await page.waitForTimeout(400);
        await harvest("chat: model picker");
      }
    }
  } finally {
    await browser.close();
    await prisma.user.delete({ where: { email: CRAWL_USER.email } }).catch(() => {});
    await prisma.$disconnect();
  }
  return [...found];
}

async function main(): Promise<void> {
  const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = await import("../lib/i18n/languages");
  const { translateBatchDetailed } = await import("../lib/i18n/translator");
  const { isTranslatable } = await import("../lib/i18n/glossary");
  const { keepEdgeWhitespace } = await import("../lib/i18n/dom");

  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = (requested.length ? requested : SUPPORTED_LANGUAGES.map((l) => l.code)).filter(
    (c) => c !== DEFAULT_LANGUAGE
  );

  const source = collectSourceStrings();
  console.log(`Source scan: ${source.strings.length} strings from ${source.files} files`);

  let crawled: string[] = [];
  if (process.argv.includes("--reuse-corpus")) {
    // Re-translate one language without the app or database running:
    // the existing packs' keys ARE the last crawl's string list.
    const keys = new Set<string>();
    for (const file of fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []) {
      if (!/^[a-z]{2,3}\.json$/.test(file)) continue;
      for (const key of Object.keys(JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), "utf8")))) keys.add(key);
    }
    crawled = [...keys];
    console.log(`Reusing ${crawled.length} strings from existing packs (no crawl)`);
  } else if (!process.argv.includes("--no-crawl")) {
    console.log(`Crawling ${BASE} …`);
    crawled = await crawl();
    console.log(`Crawl: ${crawled.length} strings`);
  }

  const corpus = [...new Set([...source.strings, ...crawled])].filter(isTranslatable);
  console.log(`Corpus: ${corpus.length} unique strings\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const manifest: { builtAt: string; strings: number; languages: Record<string, number> } = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { builtAt: "", strings: 0, languages: {} };

  let failures = 0;
  for (const target of targets) {
    const started = Date.now();
    process.stdout.write(`  ${target.padEnd(4)} `);
    try {
      const { translations, degraded } = await translateBatchDetailed(corpus, target);
      // Start from the existing pack: a string that fails this run (rate
      // limit, provider down) keeps its previous translation instead of
      // vanishing. Without this, one bad run wiped Santali from 191
      // strings to 4.
      const packFile = path.join(OUT_DIR, `${target}.json`);
      const previous: Record<string, string> = fs.existsSync(packFile)
        ? JSON.parse(fs.readFileSync(packFile, "utf8"))
        : {};
      const pack: Record<string, string> = { ...previous };
      corpus.forEach((s, i) => {
        const t = translations[i];
        if (t && t.trim() && t !== s) pack[s] = keepEdgeWhitespace(s, t);
      });
      const sorted = Object.fromEntries(Object.entries(pack).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(path.join(OUT_DIR, `${target}.json`), JSON.stringify(sorted));
      manifest.languages[target] = Object.keys(sorted).length;
      const pct = Math.round((100 * Object.keys(sorted).length) / corpus.length);
      console.log(
        `${Object.keys(sorted).length}/${corpus.length} (${pct}%) in ${((Date.now() - started) / 1000).toFixed(0)}s${degraded ? "  — some failed, re-run to fill" : ""}`
      );
      if (degraded) failures++;
    } catch (err) {
      failures++;
      console.log(`FAILED: ${String((err as any)?.message ?? err).slice(0, 100)}`);
    }
  }

  // Count from the files themselves, so an interrupted earlier run can
  // never leave the manifest reporting stale numbers.
  for (const file of fs.readdirSync(OUT_DIR).filter((f) => /^[a-z]{2,3}\.json$/.test(f))) {
    manifest.languages[file.replace(".json", "")] = Object.keys(
      JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), "utf8"))
    ).length;
  }
  manifest.builtAt = new Date().toISOString();
  manifest.strings = corpus.length;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${OUT_DIR}${failures ? `  (${failures} language(s) incomplete — re-run to fill the gaps)` : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
