// Reproduce the reported bug in a REAL browser: switch the landing page
// to a non-Hindi language and watch what actually happens on the wire
// and in the DOM. Everything so far was tested server-side, which is
// exactly why this survived.

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const TARGET = process.argv[2] ?? "ta";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const calls = [];
page.on("request", (r) => {
  if (r.url().includes("/api/i18n/translate")) {
    let count = 0;
    try { count = JSON.parse(r.postData() ?? "{}").texts?.length ?? 0; } catch {}
    calls.push({ started: Date.now(), count, status: null, ms: null, degraded: null, translated: null });
  }
});
page.on("response", async (res) => {
  if (!res.url().includes("/api/i18n/translate")) return;
  const rec = calls.find((c) => c.status === null);
  if (!rec) return;
  rec.status = res.status();
  rec.ms = Date.now() - rec.started;
  try {
    const j = await res.json();
    rec.degraded = j?.data?.degraded ?? null;
    const t = j?.data?.translations ?? [];
    rec.translated = t.filter((v) => /[^\u0000-ɏ]/.test(v ?? "")).length;
  } catch { /* body already consumed or not json */ }
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`  [console:${m.type()}] ${m.text().slice(0, 160)}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });

// Snapshot visible text before switching.
const sample = () =>
  page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = (n.nodeValue ?? "").trim();
      if (v.length > 12) out.push(v);
      if (out.length >= 400) break;
    }
    return out;
  });

const before = await sample();
const nonLatin = (arr) => arr.filter((s) => /[ऀ-෿؀-ۿ]/.test(s)).length;
console.log(`\nLanding page loaded: ${before.length} text nodes, ${nonLatin(before)} already non-Latin`);

// Switch language exactly the way a user does.
const switched = await page.evaluate((code) => {
  try {
    localStorage.setItem("ls_lang", code);
    document.cookie = `ls_lang=${code}; path=/; max-age=31536000; SameSite=Lax`;
    return true;
  } catch (e) { return String(e); }
}, TARGET);
console.log(`Set language to "${TARGET}" (${switched}); reloading…\n`);

calls.length = 0;
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "networkidle" });

// Give the translator generous time; report what lands as it lands.
for (const waitMs of [5000, 10000, 15000, 30000]) {
  await page.waitForTimeout(waitMs - (Date.now() - t0) > 0 ? waitMs - (Date.now() - t0) : 0);
  const now = await sample();
  console.log(`  t+${String(Math.round((Date.now() - t0) / 1000)).padStart(2)}s  ${nonLatin(now)}/${now.length} text nodes translated`);
}

console.log(`\n/api/i18n/translate calls: ${calls.length}`);
for (const [i, c] of calls.entries()) {
  console.log(`  #${i + 1}  ${c.count} strings  ->  HTTP ${c.status}  ${c.ms}ms  degraded=${c.degraded}  nonLatinOut=${c.translated}`);
}

const after = await sample();
console.log(`\nSample of what the user sees now:`);
for (const s of after.slice(0, 8)) console.log(`   | ${s.slice(0, 80)}`);

await browser.close();
