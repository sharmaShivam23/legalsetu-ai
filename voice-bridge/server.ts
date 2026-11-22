/**
 * LegalSetu — voice bridge
 * ------------------------------------------------------------
 *     npm run voice:bridge
 *
 * The always-on process that carries a phone call's audio. Twilio opens
 * a WebSocket here when a call connects; this process turns the audio
 * into a conversation (lib/calls/runner.ts) and talks to the app over
 * HTTP. It holds no database connection and no user data of its own.
 *
 * It must run somewhere that can keep a WebSocket open for minutes — your
 * laptop behind a tunnel for a demo, or any always-on host. It cannot
 * run on Vercel, whose functions end after a request.
 *
 * Environment (.env):
 *   CALL_BRIDGE_PORT     port to listen on                (default 8787)
 *   CALL_APP_URL         where the LegalSetu app is       (default http://localhost:3000)
 *   CALL_BRIDGE_SECRET   token signing secret             (default: derived from AUTH_SECRET)
 *   CALL_MAX_CONCURRENT  simultaneous calls               (default 5)
 *   CALL_MAX_MINUTES     longest a call may last          (default 10)
 *   CALL_MAX_SPOKEN_CHARS  most of one answer spoken aloud (default 420, about 30 s)
 *   CALL_WARM_LANGUAGES  phrases to prepare at start-up   (default "hi,en")
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { WebSocket as WS } from "ws";

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

const PORT = Number(process.env.CALL_BRIDGE_PORT) || 8787;
const APP_URL = (process.env.CALL_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const MAX_CONCURRENT = Number(process.env.CALL_MAX_CONCURRENT) || 5;

const log = (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, message, ...data }));

async function main(): Promise<void> {
  const { WebSocketServer } = await import("ws");
  const { CallRunner } = await import("../lib/calls/runner");
  const { createSpeech, withPhraseCache } = await import("../lib/calls/speech");
  const { createChatClient, createEventsClient } = await import("../lib/calls/chat-client");
  const { verifyCallToken, callSecret } = await import("../lib/calls/token");
  const { phrasesFor } = await import("../lib/calls/phrases");
  const { keepConnectionsAlive, preconnect, callHosts } = await import("../lib/calls/network");

  // Reuse connections between turns (see lib/calls/network.ts).
  await keepConnectionsAlive();

  callSecret(); // fail at start-up, not mid-call, if no secret is configured

  const speech = withPhraseCache(createSpeech());
  let active = 0;

  /** Pre-synthesises a language's fixed phrases so the first caller hears them without delay. */
  async function warm(language: string): Promise<void> {
    const p = phrasesFor(language);
    for (const text of [p.greeting, ...p.acks, p.retry, p.silence, p.goodbye, p.emergency, p.techError, p.fullSaved]) {
      await speech.phrase(text, language).catch((err) => log("warn", "Phrase warm-up failed", { language, error: String(err).slice(0, 100) }));
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, activeCalls: active }));
      return;
    }
    // The app asks us to prepare a call's language while the phone is still ringing.
    if (url.pathname === "/warm") {
      const payload = verifyCallToken(url.searchParams.get("token"));
      res.writeHead(payload ? 202 : 401);
      res.end();
      if (payload) void warm(payload.lang);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (!(req.url ?? "").startsWith("/media")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WS) => {
    let runner: InstanceType<typeof CallRunner> | null = null;
    let streamSid = "";
    let callId = "";
    let counted = false;

    // Frames from one clip are sent as ONE media message: Twilio accepts
    // any payload length, and a clip is hundreds of 20 ms frames.
    let pending: Buffer[] = [];
    const flush = () => {
      if (!pending.length || ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: Buffer.concat(pending).toString("base64") } }));
      pending = [];
    };

    ws.on("message", async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.event === "start") {
        const payload = verifyCallToken(msg.start?.customParameters?.token);
        if (!payload) {
          log("warn", "Rejected a stream with no valid call token");
          ws.close(1008, "unauthorized");
          return;
        }
        if (active >= MAX_CONCURRENT) {
          log("warn", "Too many concurrent calls", { active });
          ws.close(1013, "busy");
          return;
        }
        active++;
        counted = true;
        streamSid = msg.start.streamSid;
        callId = payload.cid;
        const token = msg.start.customParameters.token as string;

        runner = new CallRunner({
          language: payload.lang,
          maxSpokenChars: Number(process.env.CALL_MAX_SPOKEN_CHARS) > 0 ? Number(process.env.CALL_MAX_SPOKEN_CHARS) : undefined,
          maxCallMs: Number(process.env.CALL_MAX_MINUTES) > 0 ? Number(process.env.CALL_MAX_MINUTES) * 60_000 : undefined,
          transport: {
            sendFrame: (frame) => pending.push(frame),
            // Streamed speech is sent chunk by chunk, not held until the sentence ends.
            flush,
            mark: (name) => {
              flush();
              if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name } }));
            },
            clear: () => {
              pending = [];
              if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event: "clear", streamSid }));
            },
            close: () => {
              flush();
              setTimeout(() => ws.close(1000, "done"), 300);
            },
          },
          speech,
          chat: createChatClient({ appUrl: APP_URL, token, language: payload.lang }),
          events: createEventsClient({ appUrl: APP_URL, token }),
          log: (level, message, data) => log(level, message, { call: callId, ...data }),
        });
        log("info", "Call connected", { call: callId, language: payload.lang, mode: payload.mode, active });
        // Open connections to every service while the greeting is playing.
        void preconnect(callHosts(APP_URL));
        void speech.warm?.();
        void runner.start();
      } else if (msg.event === "media" && runner && msg.media?.track !== "outbound") {
        runner.onAudio(Buffer.from(msg.media.payload, "base64"));
      } else if (msg.event === "mark" && runner) {
        runner.onMark(msg.mark?.name);
      } else if (msg.event === "stop" && runner) {
        void runner.stop("caller-hung-up");
      }
    });

    ws.on("close", () => {
      if (counted) active--;
      counted = false;
      void runner?.stop("connection-closed");
      log("info", "Call disconnected", { call: callId, active });
    });
    ws.on("error", (err) => log("error", "Socket error", { call: callId, error: String(err).slice(0, 100) }));
  });

  server.listen(PORT, () => {
    log("info", "Voice bridge listening", { port: PORT, app: APP_URL });
    void speech.warm?.();
    const langs = (process.env.CALL_WARM_LANGUAGES ?? "hi,en").split(",").map((s) => s.trim()).filter(Boolean);
    void (async () => {
      for (const l of langs) await warm(l);
      log("info", "Phrase cache ready", { languages: langs });
    })();
  });

  const shutdown = () => {
    log("info", "Shutting down");
    wss.clients.forEach((c) => c.close(1001, "restart"));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
