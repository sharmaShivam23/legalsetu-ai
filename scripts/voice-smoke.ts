/**
 * LegalSetu — voice-mode smoke test
 * ------------------------------------------------------------
 *     npm run dev                 # in another terminal
 *     npm run voice:smoke
 *     npm run voice:smoke -- ta   # ask in Tamil instead
 *
 * Drives a complete spoken turn against the RUNNING app, hitting the
 * same endpoints, in the same order, as components/voice/voice-mode.tsx:
 *
 *   1. synthesise a question          (stands in for the microphone)
 *   2. POST /api/voice/stt            -> transcript + detected language
 *   3. POST /api/chat/stream          -> streamed answer
 *   4. POST /api/voice/speak          -> audio, one clause at a time
 *
 * Why this exists: voice is the one feature that cannot be verified by
 * reading the code or by a unit test, because its failures are silent.
 * The old implementation "worked" in the sense that nothing threw — it
 * simply never sent the audio anywhere, and the UI waited forever. A
 * check that drives the real loop and prints real timings is the only
 * way to know it is alive.
 *
 * The question is asked in an Indian language while `language` stays
 * English, which is the case that used to fail: recognition listened in
 * the interface language and heard nothing usable.
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

const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const EMAIL = "voice-smoke@legalsetu.local";
const PASSWORD = "VoiceSmoke!2026";

/** Questions a real user might actually ask, per language. */
const QUESTIONS: Record<string, { text: string; sarvam: string }> = {
  hi: {
    text: "मेरे मकान मालिक ने मेरा सिक्योरिटी डिपॉजिट वापस नहीं किया है, मैं क्या करूँ",
    sarvam: "hi-IN",
  },
  ta: {
    text: "என் வீட்டு உரிமையாளர் என் முன்பணத்தை திருப்பி தரவில்லை, நான் என்ன செய்வது",
    sarvam: "ta-IN",
  },
  bn: {
    text: "আমার বাড়িওয়ালা আমার জামানত ফেরত দিচ্ছে না, আমি কী করব",
    sarvam: "bn-IN",
  },
  mr: {
    text: "माझ्या घरमालकाने माझी अनामत रक्कम परत केली नाही, मी काय करावे",
    sarvam: "mr-IN",
  },
};

function sarvamKeys(): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const k = v?.trim();
    if (k && !out.includes(k)) out.push(k);
  };
  push(process.env.SARVAM_API_KEY);
  for (let i = 1; i <= 5; i++) push(process.env[`SARVAM_API_KEY_${i}`]);
  return out;
}

function cookiesFrom(res: Response, jar: Map<string, string>): Map<string, string> {
  for (const c of (res.headers as any).getSetCookie?.() ?? []) {
    const [pair] = String(c).split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return jar;
}
const cookieHeader = (jar: Map<string, string>) =>
  [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function main(): Promise<void> {
  const langArg = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "hi";
  const question = QUESTIONS[langArg];
  if (!question) {
    console.error(`No sample question for "${langArg}". Available: ${Object.keys(QUESTIONS).join(", ")}`);
    process.exit(1);
  }

  const key = sarvamKeys()[0];
  if (!key) {
    console.error("No SARVAM_API_KEY configured — voice mode is disabled.");
    process.exit(1);
  }

  // Confirm the app is actually up before blaming the voice stack.
  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`Cannot reach ${BASE}. Start the app first (npm run dev).`);
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const { extractClauses, toSpeakable } = await import("../lib/voice/speech-text");
  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: new Date() },
    create: { email: EMAIL, name: "Voice Smoke Test", passwordHash, emailVerified: new Date() },
  });

  const jar = new Map<string, string>();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: cookieHeader(jar) } });
  cookiesFrom(csrfRes, jar);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  cookiesFrom(
    await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
      body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false" }),
    }),
    jar
  );
  const session = (await (
    await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })
  ).json()) as any;
  if (!session?.user) {
    console.error("Sign-in failed — cannot test the authenticated chat endpoint.");
    process.exit(1);
  }

  console.log(`\nVoice smoke test  (asking in ${langArg}, interface language stays "en")\n`);

  // 1. Stand in for the microphone.
  let t = Date.now();
  // Try each key in turn, like the app does: an out-of-credit first key
  // (402) used to abort the whole test before the app was ever exercised.
  let ttsRes!: Response;
  for (const candidate of sarvamKeys()) {
    ttsRes = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": candidate },
      body: JSON.stringify({
        text: question.text,
        language_code: question.sarvam,
        model: "bulbul:v3",
        speaker: process.env.SARVAM_TTS_SPEAKER?.trim() || "ritu",
      }),
    });
    if (ttsRes.ok || ![401, 402, 403, 429].includes(ttsRes.status)) break;
  }
  if (!ttsRes.ok) {
    console.error(`Could not synthesise the test utterance: ${ttsRes.status}`);
    process.exit(1);
  }
  const wav = Buffer.from(((await ttsRes.json()) as any).audios[0], "base64");
  console.log(`  mic    ${String(Date.now() - t).padStart(5)}ms  ${wav.length} byte utterance`);

  // 2. Transcribe.
  t = Date.now();
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/webm" }), "utterance.webm");
  const sttRes = await fetch(`${BASE}/api/voice/stt`, {
    method: "POST",
    headers: { Cookie: cookieHeader(jar) },
    body: form,
  });
  const sttJson = (await sttRes.json()) as any;
  const sttMs = Date.now() - t;
  const transcript: string = (sttJson?.data?.transcript ?? "").trim();
  const detectedRaw: string | null = sttJson?.data?.languageCode ?? null;
  if (!transcript) {
    console.error(`  stt    FAILED — no transcript. ${JSON.stringify(sttJson).slice(0, 200)}`);
    process.exit(1);
  }
  const base = detectedRaw ? detectedRaw.split("-")[0].toLowerCase() : "en";
  const detected = base === "od" ? "or" : base;
  console.log(`  stt    ${String(sttMs).padStart(5)}ms  detected ${detectedRaw} (confidence ${sttJson?.data?.confidence})`);
  console.log(`         "${transcript}"`);
  if (detected !== langArg) {
    console.log(`  WARN   detected "${detected}" but the question was ${langArg}`);
  }

  // 3. Ask, in the language that was heard.
  t = Date.now();
  let firstToken: number | null = null;
  let sourceCount: number | null = null;
  let evidenceLevel: string | null = null;
  let firstClauseAt: number | null = null;
  let answer = "";
  let spokenTail = "";
  const clauses: string[] = [];

  const chatRes = await fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({
      content: transcript,
      language: detected,
      mode: "quick",
      modelId: "auto",
      voice: true,
    }),
  });
  if (!chatRes.ok || !chatRes.body) {
    console.error(`  chat   FAILED ${chatRes.status}: ${(await chatRes.text()).slice(0, 200)}`);
    process.exit(1);
  }

  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const ev = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const dl = frame.match(/^data:\s*(.+)$/m)?.[1];
      if (!ev || !dl) continue;
      let payload: any;
      try {
        payload = JSON.parse(dl);
      } catch {
        continue;
      }
      if (ev === "retrieval") {
        sourceCount = payload.sourceCount ?? null;
        evidenceLevel = payload.evidenceLevel ?? null;
        continue;
      }
      if (ev !== "token") continue;
      if (firstToken === null) firstToken = Date.now() - t;
      answer += payload.delta ?? "";

      const speakable = toSpeakable(answer);
      if (speakable.length > spokenTail.length) {
        const fresh = speakable.slice(spokenTail.length);
        const { sentences, rest } = extractClauses(
          fresh,
          clauses.length === 0 && spokenTail === "" ? 24 : undefined,
          // Same first-clip cap as components/voice/voice-mode.tsx.
          clauses.length === 0 && spokenTail === "" ? 60 : undefined
        );
        if (sentences.length) {
          if (firstClauseAt === null) firstClauseAt = Date.now() - t;
          clauses.push(...sentences);
          spokenTail = speakable.slice(0, speakable.length - rest.length);
        }
      }
    }
  }
  const leftover = toSpeakable(answer).slice(spokenTail.length).trim();
  if (leftover) clauses.push(leftover);

  console.log(`  rag    ${sourceCount} chunks retrieved (${evidenceLevel}) — voice asks for ${sourceCount === 3 ? "3, the narrowed voice depth" : "the default depth"}`);
  console.log(`  chat   ${String(firstToken).padStart(5)}ms to first token, first clause at ${firstClauseAt}ms, ${clauses.length} clauses`);
  console.log(`         "${answer.slice(0, 100).replace(/\n/g, " ")}..."`);

  // 4. Speak it.
  let firstAudioMs: number | null = null;
  let failures = 0;
  const speakStart = Date.now();
  for (const [i, clause] of clauses.entries()) {
    const ct = Date.now();
    const res = await fetch(`${BASE}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
      body: JSON.stringify({ text: clause, language: detected }),
    });
    if (!res.ok) {
      failures += 1;
      const detail = (await res.json().catch(() => null)) as any;
      console.log(`  tts    clause ${i + 1} FAILED ${res.status} ${detail?.error?.code ?? ""}`);
      continue;
    }
    const bytes = (await res.arrayBuffer()).byteLength;
    if (firstAudioMs === null) firstAudioMs = Date.now() - speakStart;
    console.log(
      `  tts    ${String(Date.now() - ct).padStart(5)}ms  clause ${i + 1}/${clauses.length}  ${bytes} bytes  voice=${res.headers.get("X-Voice-Language")} exact=${res.headers.get("X-Voice-Exact")}`
    );
  }

  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => {});
  await prisma.$disconnect();

  const total = sttMs + (firstClauseAt ?? 0) + (firstAudioMs ?? 0);
  console.log(`\n  Time to first spoken audio: ${total}ms`);
  console.log(`    stt ${sttMs} + think ${firstClauseAt} + synth ${firstAudioMs}`);

  if (failures > 0 || clauses.length === 0) {
    console.log(`\n  FAIL — ${failures} clause(s) could not be spoken.`);
    process.exit(1);
  }
  console.log(`\n  PASS — heard ${langArg}, answered in ${detected}, spoke ${clauses.length} clauses.`);
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
