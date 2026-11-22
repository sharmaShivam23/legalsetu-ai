/**
 * LegalSetu — phone call simulator
 * ------------------------------------------------------------
 *     npm run dev                 # the app
 *     npm run voice:bridge        # the bridge
 *     npm run call:simulate -- [hi|en] [--barge] [--keep] [--out <dir>]
 *
 * Behaves like Twilio: connects to the bridge's WebSocket, streams a
 * caller's spoken sentences in REAL TIME as 8 kHz μ-law, plays back
 * what the bridge sends (echoing Twilio's "mark" events only when the
 * audio would really have finished playing, and honouring "clear"), and
 * times every reply. Afterwards it checks what was recorded: the call
 * row, its turn timings, and the saved transcript.
 *
 * Everything real is exercised — speech recognition, the AI, retrieval,
 * speech synthesis, the database — except the telephone network itself.
 * Voice is the one feature whose failures are silent, so this is how you
 * find out whether it works without picking up a phone.
 */

import fs from "node:fs";
import os from "node:os";
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

const BRIDGE = (process.env.SIM_BRIDGE_URL || `ws://localhost:${process.env.CALL_BRIDGE_PORT || 8787}`).replace(/\/$/, "");
const FRAME_MS = 20;
const SILENCE_FRAME = Buffer.alloc(160, 0xff);

/** What the simulated caller says, turn by turn. */
const SCRIPTS: Record<string, string[]> = {
  en: [
    "My landlord has not returned my security deposit even though I moved out two months ago.",
    "I paid fifty thousand rupees as the deposit and I have a written rent agreement.",
    "I live in Pune. I only want my money back, I do not want a fight.",
  ],
  hi: [
    "मेरे मकान मालिक ने मेरा सिक्योरिटी डिपॉजिट वापस नहीं किया है, मैंने दो महीने पहले मकान खाली किया था।",
    "मैंने पचास हजार रुपये डिपॉजिट दिया था और मेरे पास लिखित किराया समझौता है।",
    "मैं पुणे में रहता हूँ। मुझे बस मेरे पैसे वापस चाहिए।",
  ],
};

const arg = (name: string) => process.argv.includes(name);
const lang = (process.argv.slice(2).find((a) => !a.startsWith("-") && SCRIPTS[a]) ?? "hi") as "hi" | "en";
const outIdx = process.argv.indexOf("--out");
const OUT_DIR = outIdx > 0 ? process.argv[outIdx + 1] : path.join(os.tmpdir(), "legalsetu-call-sim");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const { WebSocket } = await import("ws");
  const { signCallToken } = await import("../lib/calls/token");
  const { createSpeech } = await import("../lib/calls/speech");
  const { buildWav, mulawToPcm16, toFrames, rms, mulawDurationMs } = await import("../lib/calls/audio");
  const { hashPhone } = await import("../lib/calls/phone");
  const { callSecret } = await import("../lib/calls/token");

  const prisma = new PrismaClient();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cacheDir = path.resolve(process.cwd(), ".cache", "call-sim");
  fs.mkdirSync(cacheDir, { recursive: true });

  // ---- a throwaway user, call row and conversation, as POST /api/calls would make ----
  const email = "call-simulator@legalsetu.local";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Call Simulator", emailVerified: new Date() },
  });
  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title: "📞 Phone call (connecting…)" },
  });
  const call = await prisma.callSession.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      phoneMasked: "+91 ••••• ••000",
      phoneHash: hashPhone("+910000000000", callSecret()),
      language: lang,
      mode: "case",
    },
  });
  const token = signCallToken({
    cid: call.id,
    uid: user.id,
    conv: conversation.id,
    lang,
    mode: "case",
    exp: Math.floor(Date.now() / 1000) + 1800,
  });

  // Next's dev server compiles each route the first time it is used, which
  // can take 10+ seconds and would be blamed on the call. Touch them first.
  const appUrl = (process.env.CALL_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log("Warming the app's routes…");
  await Promise.all(
    ["/api/chat/stream", "/api/calls/events"].map((p) =>
      fetch(appUrl + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(60_000) }).catch(() => {})
    )
  );

  // ---- the caller's voice: synthesised once, then cached on disk ----
  console.log(`\nPreparing the caller's ${lang === "hi" ? "Hindi" : "English"} sentences…`);
  const speech = createSpeech();
  const script = SCRIPTS[lang];
  const callerAudio: Buffer[] = [];
  for (const [i, text] of script.entries()) {
    const file = path.join(cacheDir, `${lang}-${Buffer.from(text).toString("hex").slice(0, 24)}.mulaw`);
    if (fs.existsSync(file)) callerAudio.push(fs.readFileSync(file));
    else {
      const t = Date.now();
      const r = await speech.synthesize(text, lang);
      fs.writeFileSync(file, r.mulaw);
      callerAudio.push(r.mulaw);
      console.log(`  line ${i + 1}: ${(mulawDurationMs(r.mulaw) / 1000).toFixed(1)}s of speech (${r.provider}, ${Date.now() - t}ms)`);
    }
  }

  // ---- the simulated phone line ----
  const ws = new WebSocket(`${BRIDGE}/media`);
  const streamSid = "MZ" + Math.random().toString(16).slice(2, 18);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(new Error(`Cannot reach the voice bridge at ${BRIDGE} — is "npm run voice:bridge" running? (${e.message})`)));
  });

  const toCaller: Buffer[] = []; // frames queued to send; silence fills the gaps
  let speechEndedAt = 0;
  let firstReplyAt = 0;
  let lastBotMediaAt = 0;
  let playhead = 0; // when the audio sent so far would finish playing
  let clears = 0;
  const markTimers = new Set<ReturnType<typeof setTimeout>>();
  const botAudio: { at: number; buf: Buffer }[] = [];
  let closed = false;

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const now = Date.now();
    if (msg.event === "media") {
      const buf = Buffer.from(msg.media.payload, "base64");
      botAudio.push({ at: now, buf });
      lastBotMediaAt = now;
      if (speechEndedAt && !firstReplyAt) firstReplyAt = now;
      playhead = Math.max(playhead, now) + mulawDurationMs(buf);
    } else if (msg.event === "mark") {
      const t = setTimeout(() => {
        markTimers.delete(t);
        if (!closed) ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name: msg.mark.name } }));
      }, Math.max(0, playhead - now));
      markTimers.add(t);
    } else if (msg.event === "clear") {
      clears++;
      playhead = now;
      for (const t of markTimers) clearTimeout(t);
      markTimers.clear();
    }
  });
  ws.on("close", () => (closed = true));

  // Real-time audio from the caller: speech when queued, line silence otherwise.
  let n = 0;
  const startedAt = Date.now();
  const pump = (async () => {
    while (!closed) {
      const frame = toCaller.shift() ?? SILENCE_FRAME;
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ event: "media", streamSid, media: { track: "inbound", payload: frame.toString("base64") } }));
      }
      if (!toCaller.length && speechEndedAt === -1) speechEndedAt = Date.now();
      n++;
      const wait = startedAt + n * FRAME_MS - Date.now();
      if (wait > 0) await sleep(wait);
    }
  })();

  const botBusy = () => Date.now() < playhead || Date.now() - lastBotMediaAt < 1200;
  const waitUntil = async (cond: () => boolean, timeoutMs: number) => {
    const t = Date.now();
    while (!cond() && Date.now() - t < timeoutMs && !closed) await sleep(40);
    return cond();
  };

  // ---- go ----
  const callStart = Date.now();
  ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  ws.send(JSON.stringify({ event: "start", streamSid, start: { streamSid, callSid: "CAsimulated", customParameters: { token } } }));
  console.log(`\n📞 Call connected (${BRIDGE}).\n`);

  const heardGreeting = await waitUntil(() => botAudio.length > 0 && !botBusy(), 60_000);
  if (!heardGreeting) throw new Error("The bridge never played a greeting.");
  console.log(`  greeting played (${(botAudio.reduce((s, a) => s + mulawDurationMs(a.buf), 0) / 1000).toFixed(1)}s, first audio ${botAudio[0].at - callStart}ms after connect)`);

  interface Row {
    n: number;
    said: string;
    firstReplyMs: number | null;
    replyAudioS: number;
    replied: boolean;
  }
  const rows: Row[] = [];

  for (const [i, line] of callerAudio.entries()) {
    await sleep(700);
    botAudio.length = 0;
    firstReplyAt = 0;
    speechEndedAt = 0;

    if (arg("--barge") && i === 1) {
      // Talk over the assistant: wait until it is mid-answer, then speak.
      await waitUntil(() => botAudio.length > 0, 20_000);
      await sleep(900);
    }

    const bargeClearsBefore = clears;
    const answersBefore = await prisma.message.count({ where: { conversationId: conversation.id, role: "ASSISTANT" } });
    const turnsBefore =
      (((await prisma.callSession.findUnique({ where: { id: call.id }, select: { metrics: true } }))?.metrics as any)?.turns?.length ?? 0) as number;
    toCaller.push(...toFrames(line));
    speechEndedAt = -1; // armed: the pump stamps the moment the last frame goes out
    await waitUntil(() => speechEndedAt > 0, 60_000);

    const replied = await waitUntil(() => firstReplyAt > 0, 60_000);

    // A person waits for the ANSWER, not just the first "okay, I see". Wait
    // until the bridge records this turn as finished (all of its audio sent),
    // then until that audio has finished playing, before saying anything more.
    const answerDeadline = Date.now() + 120_000;
    while (Date.now() < answerDeadline && !closed) {
      const row = await prisma.callSession.findUnique({ where: { id: call.id }, select: { metrics: true } });
      const recorded = ((row?.metrics as any)?.turns?.length ?? 0) as number;
      if (recorded > turnsBefore) break;
      await sleep(400);
    }
    void answersBefore;
    await waitUntil(() => !botBusy(), 90_000);

    const audioS = botAudio.reduce((s, a) => s + mulawDurationMs(a.buf), 0) / 1000;
    rows.push({
      n: i + 1,
      said: script[i],
      firstReplyMs: replied ? firstReplyAt - speechEndedAt : null,
      replyAudioS: audioS,
      replied,
    });

    const wavName = path.join(OUT_DIR, `reply-${i + 1}.wav`);
    const pcm = Buffer.concat(botAudio.map((a) => mulawToPcm16(a.buf)));
    fs.writeFileSync(wavName, buildWav(pcm, 8000));
    console.log(
      `  turn ${i + 1}: first sound ${replied ? `${firstReplyAt - speechEndedAt}ms` : "NONE"} after the caller stopped, ` +
        `${audioS.toFixed(1)}s of reply${clears > bargeClearsBefore ? " (interrupted)" : ""}  → ${path.basename(wavName)} rms=${rms(pcm).toFixed(3)}`
    );
  }

  // ---- hang up like a caller would ----
  const durationS = Math.round((Date.now() - callStart) / 1000);
  ws.send(JSON.stringify({ event: "stop", streamSid }));
  await sleep(300);
  ws.close();
  closed = true;
  await pump;
  await sleep(1500); // let the bridge's final events reach the app

  // ---- what was recorded? ----
  const saved = await prisma.callSession.findUnique({ where: { id: call.id } });
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, kind: true },
  });
  const conv = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { title: true } });
  const metrics = (saved?.metrics as any) ?? {};

  console.log(`\nRecorded call: status=${saved?.status} duration=${saved?.durationSec}s turns=${saved?.turnCount} title="${conv?.title}"`);
  if (metrics.summary) console.log(`Reply latency from the call's own timings: avg ${metrics.summary.avgFirstAudioMs}ms, p50 ${metrics.summary.p50FirstAudioMs}ms, p90 ${metrics.summary.p90FirstAudioMs}ms`);
  for (const t of metrics.turns ?? []) {
    console.log(`  turn ${t.n}: heard in ${t.sttMs}ms (${t.sttProvider}), AI first word ${t.llmFirstTokenMs}ms, first clause spoken ${t.ttsFirstMs}ms (${t.ttsProvider}), answer sound ${t.firstAudioMs}ms${t.fillerPlayed ? ", acknowledgement played" : ""}${t.interrupted ? ", interrupted" : ""}`);
  }
  console.log("\nTranscript saved to History:");
  for (const m of messages) console.log(`  ${m.role === "USER" ? "Caller   " : "LegalSetu"}: ${m.content.replace(/\s+/g, " ").slice(0, 150)}`);

  // ---- verdict ----
  // Strict on purpose: an acknowledgement ("okay, I see") is not an answer, and
  // a turn cut short by a pause inside the caller's own sentence is a bug.
  const problems: string[] = [];
  const barge = arg("--barge");
  const turnsRecorded = (metrics.turns ?? []) as { firstAudioMs: number | null; interrupted: boolean }[];
  const userMsgs = messages.filter((m) => m.role === "USER");

  if (rows.some((r) => !r.replied)) problems.push("a turn got no spoken reply");
  if (saved?.status !== "COMPLETED") problems.push(`call status is ${saved?.status}, not COMPLETED`);
  if (messages.filter((m) => m.role === "ASSISTANT").length < 1) problems.push("no assistant reply was saved");
  if (messages.some((m) => /@@|<\|/.test(m.content))) problems.push("a control marker leaked into the transcript");
  if (!conv?.title.startsWith("📞 Phone call ·")) problems.push("the conversation was not retitled");
  if (!barge) {
    if (turnsRecorded.some((t) => t.interrupted)) problems.push("a turn was cut off by a pause inside the caller's own sentence");
    if (turnsRecorded.some((t) => t.firstAudioMs == null)) problems.push("a turn was never answered aloud (only an acknowledgement, if anything)");
    if (turnsRecorded.length !== rows.length) problems.push(`${turnsRecorded.length} turns recorded for ${rows.length} things the caller said`);
    if (userMsgs.length !== rows.length) problems.push(`${userMsgs.length} caller messages saved for ${rows.length} things the caller said (a sentence was split or repeated)`);
  }

  console.log(`\nCall lasted ${durationS}s. Audio of each reply: ${OUT_DIR}`);
  if (!arg("--keep")) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  await prisma.$disconnect();

  if (problems.length) {
    console.log(`\nFAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("\nPASS — the call was heard, answered aloud, and saved.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nSimulation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
