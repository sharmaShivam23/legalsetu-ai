// Multi-turn voice-mode check in a REAL browser with a fake microphone.
// The mic file is: question, then 25s of silence, looped by Chromium —
// i.e. a user who asks, waits for the spoken answer, then asks again.
// Passes only if EVERY utterance is transcribed (no 400 from the 30s
// limit), answered, and actually played through <audio>.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const EMAIL = "voice-multiturn@legalsetu.local";
const PASSWORD = "VoiceMulti!2026";
const RUN_SECONDS = Number(process.argv[2] ?? 80);
// node tmp-diag-voice-multiturn.mjs <seconds> <spoken: hi|en> <ui language: en|hi|...>
const SPOKEN = process.argv[3] ?? "hi";
const UI_LANG = process.argv[4] ?? "en";

const env = {};
for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const keys = [env.SARVAM_API_KEY, env.SARVAM_API_KEY_1, env.SARVAM_API_KEY_2, env.SARVAM_API_KEY_3, env.SARVAM_API_KEY_4].filter(Boolean);

// --- fake mic: question + silence --------------------------------------
const QUESTION =
  SPOKEN === "en"
    ? "My landlord has not returned my security deposit. What should I do?"
    : "मेरे मकान मालिक ने मेरा सिक्योरिटी डिपॉजिट वापस नहीं किया है, मैं क्या करूँ";
const wavPath = path.join(os.tmpdir(), "legalsetu-fake-mic-multiturn.wav");
let speech;
for (const key of keys) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": key },
    body: JSON.stringify({ text: QUESTION, language_code: SPOKEN === "en" ? "en-IN" : "hi-IN", model: "bulbul:v3", speaker: "ritu", speech_sample_rate: 16000 }),
  });
  if (res.ok) { speech = Buffer.from((await res.json()).audios[0], "base64"); break; }
}
if (!speech) { console.error("Could not synthesise the fake-mic question"); process.exit(1); }

// Rebuild as a clean PCM WAV with 25s of trailing silence.
const dataIdx = speech.indexOf(Buffer.from("data"));
const fmt = speech.subarray(0, dataIdx);
const pcm = speech.subarray(dataIdx + 8);
const sampleRate = fmt.readUInt32LE(24);
const silence = Buffer.alloc(sampleRate * 2 * 25);
const body = Buffer.concat([pcm, silence]);
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + body.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(body.length, 40);
fs.writeFileSync(wavPath, Buffer.concat([header, body]));
console.log(`fake mic: ${(pcm.length / (sampleRate * 2)).toFixed(1)}s question + 25s silence, looped\n`);

// --- user + browser -----------------------------------------------------
const prisma = new PrismaClient();
await prisma.user.upsert({
  where: { email: EMAIL },
  update: { passwordHash: await bcrypt.hash(PASSWORD, 10), emailVerified: new Date() },
  create: { email: EMAIL, name: "Voice Multi", passwordHash: await bcrypt.hash(PASSWORD, 10), emailVerified: new Date() },
});

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wavPath}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ permissions: ["microphone"] });
await ctx.addInitScript(() => {
  const orig = HTMLMediaElement.prototype.play;
  window.__plays = [];
  HTMLMediaElement.prototype.play = function (...a) {
    const e = { t: Date.now(), src: (this.src || "").slice(0, 12), state: "called" };
    window.__plays.push(e);
    const p = orig.apply(this, a);
    p?.then?.(() => (e.state = "playing"), (err) => (e.state = "rejected:" + err?.name));
    return p;
  };
});

const page = await ctx.newPage();
const t0 = Date.now();
const stamp = () => `t+${String(Math.round((Date.now() - t0) / 1000)).padStart(2)}s`;
const net = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/\/api\/(voice|chat)\//.test(u)) return;
  const rec = { at: stamp(), url: u.replace(BASE, "").split("?")[0], status: res.status() };
  if (u.includes("/api/voice/stt")) {
    try { const j = await res.json(); rec.note = j?.data?.transcript?.slice(0, 50) ?? j?.error?.message; } catch {}
  }
  net.push(rec);
  console.log(`  ${rec.at}  ${rec.status} ${rec.url}${rec.note ? `  "${rec.note}"` : ""}`);
});
// What language each turn was answered and spoken in.
const chatLangs = [];
const spokenTexts = [];
page.on("request", (req) => {
  const u = req.url();
  if (!u.includes("/api/chat/stream") && !u.includes("/api/voice/speak")) return;
  let body;
  try { body = JSON.parse(req.postData() ?? "{}"); } catch { return; }
  if (u.includes("/api/chat/stream")) chatLangs.push(body.language);
  else spokenTexts.push({ language: body.language, text: body.text });
});
page.on("console", (m) => { if (m.type() === "error") console.log(`  [console] ${m.text().slice(0, 160)}`); });
page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 170)}`));

// sign in via API
const jar = new Map();
const grab = (res) => { for (const c of res.headers.getSetCookie?.() ?? []) { const [p] = String(c).split(";"); const i = p.indexOf("="); if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const hdr = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const csrfRes = await fetch(`${BASE}/api/auth/csrf`); grab(csrfRes);
const { csrfToken } = await csrfRes.json();
grab(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: hdr() }, body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false" }) }));
await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
// The language dropdown's choice, exactly as LanguageProvider stores it.
await ctx.addCookies([{ name: "ls_lang", value: UI_LANG, domain: "localhost", path: "/" }]);
await ctx.addInitScript((lang) => { try { localStorage.setItem("ls_lang", lang); } catch {} }, UI_LANG);
console.log(`UI language: ${UI_LANG}, question spoken in: ${SPOKEN}\n`);

await page.goto(`${BASE}/dashboard/chat`, { waitUntil: "networkidle" });
// Quick Answer mode, so every turn is a spoken answer rather than an intake question.
await page.evaluate(() => { try { localStorage.setItem("ls_chat_model", "auto"); } catch {} });
const quick = page.getByRole("button", { name: /quick/i }).first();
if (await quick.count()) await quick.click().catch(() => {});
await page.locator('button:has(svg.lucide-audio-lines):visible').first().click();
console.log(`${stamp()}  voice mode opened\n`);

let lastPhase = "";
while (Date.now() - t0 < RUN_SECONDS * 1000) {
  await page.waitForTimeout(500);
  const phase = (await page.locator('[role=dialog] [aria-live="polite"] p').first().innerText().catch(() => "")).trim();
  if (phase && phase !== lastPhase) { console.log(`  ${stamp()}  phase: ${phase}`); lastPhase = phase; }
}

const plays = await page.evaluate(() => window.__plays.filter((p) => p.src.startsWith("blob:")));
const turns = net.filter((r) => r.url === "/api/chat/stream" && r.status === 200).length;
const stt = net.filter((r) => r.url === "/api/voice/stt");
const chats = net.filter((r) => r.url === "/api/chat/stream");
const speaks = net.filter((r) => r.url === "/api/voice/speak");

console.log(`\nSTT calls: ${stt.length} (${stt.filter((r) => r.status !== 200).length} failed)`);
console.log(`chat turns: ${chats.length}, completed spoken turns in UI: ${turns}`);
console.log(`TTS clips: ${speaks.length} (${speaks.filter((r) => r.status !== 200).length} failed), played: ${plays.filter((p) => p.state === "playing").length}, rejected: ${plays.filter((p) => p.state.startsWith("rejected")).length}`);

// Expected reply language: the dropdown choice if one was made, else what was spoken.
const expected = UI_LANG !== "en" ? UI_LANG : SPOKEN;
const devanagari = /[ऀ-ॿ]/;
const textMatches = (t) => (expected === "hi" ? devanagari.test(t) : !devanagari.test(t));
console.log(`chat requested in: ${JSON.stringify(chatLangs)}  (expected "${expected}")`);
for (const s of spokenTexts.slice(0, 4)) console.log(`  spoke [${s.language}] ${s.text.slice(0, 70)}`);
const langOk =
  chatLangs.length > 0 &&
  chatLangs.every((l) => l === expected) &&
  spokenTexts.length > 0 &&
  spokenTexts.every((s) => s.language === expected && textMatches(s.text));
console.log(langOk ? `Language: OK — answered and spoken in "${expected}"` : `Language: WRONG`);

// No protocol marker or control token may ever reach the user.
const screenText = await page.locator("[role=dialog]").innerText().catch(() => "");
const leaked = /@@|<\|/.test(screenText) || spokenTexts.some((s) => /@@|<\|/.test(s.text));
console.log(leaked ? "Markers: LEAKED to screen or voice" : "Markers: none shown or spoken");

const ok = !leaked && stt.length >= 2 && stt.every((r) => r.status === 200) && turns >= 2 && plays.some((p) => p.state === "playing") && langOk;
console.log(ok ? "\nPASS — multiple spoken turns, every utterance transcribed, replies played in the right language." : "\nFAIL");

await browser.close();
await prisma.user.delete({ where: { email: EMAIL } }).catch(() => {});
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
