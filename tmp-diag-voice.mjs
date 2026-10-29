// Drive voice mode in a REAL browser with a fake microphone, and
// instrument HTMLMediaElement.play() so we can see whether audio is
// actually played or silently dropped.
//
// Chromium can take a WAV file as the microphone, so this is a genuine
// end-to-end test: real getUserMedia, real MediaRecorder, real VAD,
// real /api/voice/* calls, real <audio> playback.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const EMAIL = "voice-diag@legalsetu.local";
const PASSWORD = "VoiceDiag!2026";

const env = {};
for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
// Key 1 is out of credits; the test harness needs a live one to build
// the fake-microphone audio. The APP is expected to rotate past the dead
// key on its own - that is what this test verifies.
const sarvamKey = [env.SARVAM_API_KEY_2, env.SARVAM_API_KEY_3, env.SARVAM_API_KEY_4].filter(Boolean)[0];

// --- 1. Build a fake microphone input -----------------------------
// Chromium's fake audio capture wants 16-bit PCM WAV. Sarvam returns
// WAV already; request 16kHz so no resampling surprises.
const QUESTION = "मेरे मकान मालिक ने मेरा सिक्योरिटी डिपॉजिट वापस नहीं किया है, मैं क्या करूँ";
const wavPath = path.join(os.tmpdir(), "legalsetu-fake-mic.wav");

if (!fs.existsSync(wavPath) || process.argv.includes("--regen")) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": sarvamKey },
    body: JSON.stringify({
      text: QUESTION,
      language_code: "hi-IN",
      model: "bulbul:v3",
      speaker: "ritu",
      speech_sample_rate: 16000,
    }),
  });
  if (!res.ok) { console.error("TTS for fake mic failed", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  fs.writeFileSync(wavPath, Buffer.from((await res.json()).audios[0], "base64"));
}
console.log(`fake mic: ${wavPath} (${fs.statSync(wavPath).size} bytes)\n`);

// --- 2. A user to sign in as --------------------------------------
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(PASSWORD, 10);
await prisma.user.upsert({
  where: { email: EMAIL },
  update: { passwordHash, emailVerified: new Date() },
  create: { email: EMAIL, name: "Voice Diag", passwordHash, emailVerified: new Date() },
});

// --- 3. Browser with a fake mic -----------------------------------
const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wavPath}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ permissions: ["microphone"] });

// Instrument media playback BEFORE any app code runs.
await ctx.addInitScript(() => {
  const origPlay = HTMLMediaElement.prototype.play;
  window.__audioLog = [];
  HTMLMediaElement.prototype.play = function (...args) {
    const src = (this.src || "").slice(0, 60);
    const entry = { t: Date.now(), src, state: "called" };
    window.__audioLog.push(entry);
    let p;
    try {
      p = origPlay.apply(this, args);
    } catch (e) {
      entry.state = "threw:" + String(e).slice(0, 80);
      throw e;
    }
    if (p && typeof p.then === "function") {
      p.then(
        () => { entry.state = "playing"; entry.duration = this.duration; },
        (e) => { entry.state = "rejected:" + (e?.name ?? String(e)).slice(0, 60); }
      );
    }
    return p;
  };
  // Also record when playback actually ends, which is what pump() waits on.
  document.addEventListener("ended", (e) => {
    if (e.target instanceof HTMLMediaElement) window.__audioLog.push({ t: Date.now(), state: "ended" });
  }, true);
});

const page = await ctx.newPage();
const net = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/\/api\/(voice|chat)\//.test(u)) return;
  const rec = { url: u.replace(BASE, ""), status: res.status(), type: res.headers()["content-type"] ?? "", bytes: null };
  if (rec.type.startsWith("audio/")) {
    try { rec.bytes = (await res.body()).length; } catch {}
  }
  net.push(rec);
});
page.on("console", (m) => {
  const txt = m.text();
  if (/WebGL|THREE|GL Driver/.test(txt)) return;
  if (m.type() === "error" || m.type() === "warning") console.log(`  [console:${m.type()}] ${txt.slice(0, 170)}`);
});
page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 170)}`));

// --- 4. Sign in through the API, then hand the cookies to the browser.
// Driving the login form is racy, and its failure mode is a silent
// redirect back to /login that wastes a whole run.
const jar = new Map();
const grab = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = String(c).split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const hdr = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
grab(csrfRes);
const { csrfToken } = await csrfRes.json();
grab(
  await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: hdr() },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false" }),
  })
);
await ctx.addCookies(
  [...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" }))
);
await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
if (page.url().includes("/login")) {
  console.error("Sign-in failed; cannot reach the dashboard.");
  await browser.close();
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`signed in -> ${page.url()}`);

// --- 5. Open the chat page and then voice mode ---------------------
await page.goto(`${BASE}/dashboard/chat`, { waitUntil: "networkidle" });

const voiceBtn = page.locator('button[aria-label*="voice" i], button[title*="voice" i]').first();
if ((await voiceBtn.count()) === 0) {
  console.log("Could not find the voice-mode button. Buttons on page:");
  for (const b of await page.locator("button").all()) {
    const label = (await b.getAttribute("aria-label")) ?? (await b.getAttribute("title")) ?? (await b.innerText().catch(() => ""));
    if (label?.trim()) console.log(`   - ${label.trim().slice(0, 60)}`);
  }
  await browser.close(); await prisma.$disconnect(); process.exit(1);
}
await voiceBtn.click();
console.log("voice mode opened; listening to the fake mic…\n");

// --- 6. Watch the phase machine ------------------------------------
const seen = new Set();
const start = Date.now();
for (let i = 0; i < 70; i++) {
  await page.waitForTimeout(1000);
  const status = await page
    .locator('[aria-live="polite"] p')
    .first()
    .innerText()
    .catch(() => "");
  const key = status.trim();
  if (key && !seen.has(key)) {
    seen.add(key);
    console.log(`  t+${String(Math.round((Date.now() - start) / 1000)).padStart(2)}s  phase: ${key}`);
  }
  const log = await page.evaluate(() => window.__audioLog ?? []);
  if (log.some((e) => e.state === "playing" || String(e.state).startsWith("rejected"))) {
    if (i > 6) break;
  }
}

const audioLog = await page.evaluate(() => window.__audioLog ?? []);
console.log(`\nHTMLMediaElement.play() calls: ${audioLog.length}`);
for (const e of audioLog.slice(0, 14)) {
  console.log(`   ${String(e.state).padEnd(28)} dur=${e.duration ?? "-"}  src=${e.src || "(none)"}`);
}

console.log(`\n/api/voice + /api/chat responses:`);
for (const r of net) {
  console.log(`   ${String(r.status).padEnd(4)} ${r.url.padEnd(26)} ${r.type.slice(0, 24).padEnd(26)} ${r.bytes ?? ""}`);
}

const transcript = await page.locator("text=You said").locator("..").innerText().catch(() => "(none)");
console.log(`\nTranscript panel: ${transcript.replace(/\n/g, " ").slice(0, 140)}`);

await browser.close();
await prisma.user.delete({ where: { email: EMAIL } }).catch(() => {});
await prisma.$disconnect();
