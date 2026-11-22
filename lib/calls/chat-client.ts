// ==========================================================
// LegalSetu — the bridge's client for the chat API
// ----------------------------------------------------------
// A phone call asks the SAME endpoint the website uses
// (/api/chat/stream), so a call gets the case intake, the verified
// legal-source search, citation checking, provider failover and
// conversation history without any of it being rewritten. Only the
// credential differs: the call's signed token instead of a session.
// ==========================================================

export type ChatEvent =
  | { type: "token"; delta: string }
  | { type: "kind"; kind: string }
  | { type: "done"; conversationId?: string; kind?: string }
  | { type: "error"; message: string };

export interface ChatPort {
  turn(text: string, signal: AbortSignal): AsyncGenerator<ChatEvent>;
}

export interface ChatClientOptions {
  appUrl: string;
  token: string;
  language: string;
  modelId?: string;
}

export function createChatClient(opts: ChatClientOptions): ChatPort {
  return {
    async *turn(text, signal) {
      let res: Response;
      try {
        res = await fetch(`${opts.appUrl.replace(/\/$/, "")}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `CallToken ${opts.token}` },
          body: JSON.stringify({ content: text, language: opts.language, modelId: opts.modelId ?? "auto" }),
          signal,
        });
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        yield { type: "error", message: `Could not reach the app: ${String((err as any)?.cause?.code ?? err).slice(0, 80)}` };
        return;
      }

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        yield { type: "error", message: detail?.error?.message ?? `The app answered ${res.status}` };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = frame.split("\n").find((l) => l.startsWith("event:"))?.slice(6).trim();
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
            if (!event || !dataLine) continue;
            let data: any;
            try {
              data = JSON.parse(dataLine);
            } catch {
              continue;
            }
            if (event === "token" && data.delta) yield { type: "token", delta: String(data.delta) };
            else if (event === "kind") yield { type: "kind", kind: String(data.kind) };
            else if (event === "done") yield { type: "done", conversationId: data.conversationId, kind: data.kind };
            else if (event === "error") yield { type: "error", message: String(data.message ?? "The assistant had an error") };
          }
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") yield { type: "error", message: String(err).slice(0, 100) };
      }
    },
  };
}

/** Reports call lifecycle events back to the app, so History and the dashboard stay current. */
export interface EventsPort {
  started(): Promise<void>;
  turn(metric: TurnMetric): Promise<void>;
  ended(info: { durationSec: number; reason: string }): Promise<void>;
}

export interface TurnMetric {
  n: number;
  /** Caller stopped speaking -> first audio of the reply was sent, ms. */
  firstAudioMs: number | null;
  sttMs: number;
  /** Transcript ready -> first token of the AI's reply, ms. */
  llmFirstTokenMs: number | null;
  /** First clause synthesised, ms. */
  ttsFirstMs: number | null;
  sttProvider: string;
  ttsProvider: string | null;
  kind: string | null;
  fillerPlayed: boolean;
  interrupted: boolean;
}

export function createEventsClient(opts: { appUrl: string; token: string }): EventsPort {
  const post = async (body: unknown) => {
    try {
      await fetch(`${opts.appUrl.replace(/\/$/, "")}/api/calls/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `CallToken ${opts.token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Bookkeeping must never take a live call down.
    }
  };
  return {
    started: () => post({ event: "started" }),
    turn: (metric) => post({ event: "turn", metric }),
    ended: (info) => post({ event: "ended", ...info }),
  };
}
