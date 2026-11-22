// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { createLiveVoice, Downsampler24to8, type LiveVoice } from "@/lib/calls/gemini-live";

/** 16-bit PCM at 24 kHz: a tone of the given length. */
function pcm24k(ms: number): Buffer {
  const n = (24000 * ms) / 1000;
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / 24000) * 12000), i * 2);
  return b;
}

type Behaviour = {
  /** How many 100 ms audio chunks to send per sentence. */
  chunks?: number;
  /** Delay before the first chunk, ms. */
  firstDelay?: number;
  /** Close the socket right after setup instead of becoming ready. */
  refuse?: boolean;
  /** Close the socket when text arrives (a session that dies mid-use). */
  dieOnText?: boolean;
  /** Never send any audio. */
  silent?: boolean;
};

describe("Gemini live voice (against a scripted local server)", () => {
  let server: WebSocketServer;
  let url = "";
  let behaviour: Behaviour = {};
  let setups = 0;
  let texts: string[] = [];
  let sockets: WebSocket[] = [];
  let voice: LiveVoice;

  beforeEach(async () => {
    behaviour = {};
    setups = 0;
    texts = [];
    sockets = [];
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((r) => server.once("listening", () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

    server.on("connection", (ws) => {
      sockets.push(ws);
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.setup) {
          setups++;
          if (behaviour.refuse) return void ws.close(1008, "denied");
          ws.send(JSON.stringify({ setupComplete: {} }));
        } else if (msg.clientContent) {
          texts.push(msg.clientContent.turns[0].parts[0].text);
          if (behaviour.dieOnText) return void ws.terminate();
          if (behaviour.silent) return;
          const n = behaviour.chunks ?? 3;
          setTimeout(async () => {
            for (let i = 0; i < n; i++) {
              if (ws.readyState !== ws.OPEN) return;
              ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm24k(100).toString("base64") } }] } } }));
              await new Promise((r) => setTimeout(r, 10));
            }
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
          }, behaviour.firstDelay ?? 5);
        }
      });
    });

    voice = createLiveVoice({ keys: () => ["k1", "k2"], urlFor: () => url, openTimeoutMs: 1500, firstChunkTimeoutMs: 800, maxSessions: 2, maxUses: 3 });
  });

  afterEach(async () => {
    voice.close();
    for (const s of sockets) s.terminate();
    await new Promise((r) => server.close(r));
  });

  const collect = async (text: string, signal = new AbortController().signal) => {
    const parts: Buffer[] = [];
    for await (const c of voice.stream(text, signal)) parts.push(c);
    return Buffer.concat(parts);
  };

  it("streams a sentence as 8 kHz audio of the right length", async () => {
    behaviour = { chunks: 5 }; // 5 x 100 ms = 500 ms
    const audio = await collect("नमस्ते");
    // 500 ms at 8 kHz, 16-bit = 8000 bytes.
    expect(audio.length).toBe(8000);
    expect(texts).toEqual(["नमस्ते"]);
  });

  it("delivers the first chunk before the sentence has finished", async () => {
    behaviour = { chunks: 8 };
    const arrivals: number[] = [];
    const t0 = Date.now();
    for await (const _ of voice.stream("hello", new AbortController().signal)) arrivals.push(Date.now() - t0);
    expect(arrivals.length).toBeGreaterThan(1);
    expect(arrivals[arrivals.length - 1] - arrivals[0]).toBeGreaterThan(20); // spread out, not one burst
  });

  it("reuses one session for consecutive sentences instead of reconnecting", async () => {
    await collect("one");
    await collect("two");
    await collect("three");
    expect(setups).toBe(1);
    expect(texts).toEqual(["one", "two", "three"]);
  });

  it("retires a session after its use limit and opens a fresh one", async () => {
    for (const t of ["a", "b", "c", "d"]) await collect(t); // maxUses = 3
    expect(setups).toBe(2);
  });

  it("runs sentences in parallel on separate sessions, up to the limit", async () => {
    behaviour = { chunks: 4, firstDelay: 60 };
    await Promise.all([collect("first"), collect("second")]);
    expect(setups).toBe(2);
  });

  it("makes a third sentence wait for a free session rather than exceeding the limit", async () => {
    behaviour = { chunks: 3, firstDelay: 40 };
    const results = await Promise.all([collect("a"), collect("b"), collect("c")]);
    expect(results.every((r) => r.length > 0)).toBe(true);
    expect(setups).toBeLessThanOrEqual(3); // never more than 2 live at once; a retired one may be replaced
    expect(texts.sort()).toEqual(["a", "b", "c"]);
  });

  it("stops and discards the session when the caller interrupts", async () => {
    behaviour = { chunks: 30, firstDelay: 5 };
    const abort = new AbortController();
    let got = 0;
    for await (const _ of voice.stream("a long sentence", abort.signal)) {
      if (++got === 2) abort.abort();
    }
    expect(got).toBeLessThan(30);
    // The half-spoken session is not reused; the next sentence gets a fresh one.
    behaviour = { chunks: 2 };
    await collect("next");
    expect(setups).toBe(2);
  });

  it("fails fast, before any audio, when the service refuses the session", async () => {
    behaviour = { refuse: true };
    await expect(collect("hello")).rejects.toThrow(/refused|ready|closed/);
  });

  it("fails (so the caller can fall back) when no audio ever starts", async () => {
    behaviour = { silent: true };
    await expect(collect("hello")).rejects.toThrow(/no audio/);
  });

  it("reports a session that dies mid-sentence instead of hanging", async () => {
    behaviour = { dieOnText: true };
    await expect(collect("hello")).rejects.toThrow(/closed|error/);
  });

  it("can be warmed so the first sentence needs no connection time", async () => {
    await voice.warm(2);
    expect(voice.stats()).toEqual({ sessions: 2, idle: 2 });
    const before = setups;
    await collect("hello");
    expect(setups).toBe(before); // used a warm session
  });
});

describe("Downsampler24to8", () => {
  it("turns 24 kHz into exactly a third as many samples, across any chunking", () => {
    const whole = pcm24k(300);
    const a = new Downsampler24to8();
    const oneShot = a.push(whole);

    const b = new Downsampler24to8();
    // Awkward chunk sizes that do not divide by three samples.
    const pieces: Buffer[] = [];
    for (let i = 0; i < whole.length; ) {
      const size = [14, 22, 6, 100][pieces.length % 4];
      pieces.push(b.push(whole.subarray(i, i + size)));
      i += size;
    }
    const chunked = Buffer.concat(pieces);
    expect(oneShot.length).toBe(4800); // 300 ms at 8 kHz
    expect(chunked.equals(oneShot)).toBe(true);
  });
});
