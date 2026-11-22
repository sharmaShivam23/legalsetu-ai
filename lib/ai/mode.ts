// ==========================================================
// LegalSetu — "Ollama mode" (server-wide switch)
// ----------------------------------------------------------
// When ON, every AI call (chat, translation, document analysis, query
// rewriting) goes to the local Ollama server and NOTHING falls back to a
// cloud provider. It is global to the server process on purpose: the chat
// route, the translator and the retriever all have to agree.
//
// State lives in globalThis (shared across Next's separately-bundled route
// modules) and is mirrored to .ollama-mode.json so a dev-server restart
// keeps it. On Vercel the file is read-only: writes fail quietly and the
// in-memory value is used — but Vercel cannot reach Ollama anyway, so the
// API route refuses to enable it there (Ollama must be reachable).
//
// AI_FORCE_OLLAMA=1 in .env turns it on at startup.
// ==========================================================

import fs from "node:fs";
import path from "node:path";

interface ModeState {
  enabled: boolean;
  /** Ollama model picked in the UI; null = use OLLAMA_CHAT_MODEL. */
  model: string | null;
}

const FILE = path.join(process.cwd(), ".ollama-mode.json");
const RECHECK_MS = 1000;

type Holder = { state?: ModeState; readAt?: number };
const g = globalThis as unknown as { __legalsetuOllamaMode?: Holder };
const holder: Holder = (g.__legalsetuOllamaMode ??= {});

function envDefault(): ModeState {
  const v = process.env.AI_FORCE_OLLAMA?.trim().toLowerCase();
  return { enabled: v === "1" || v === "true", model: null };
}

function load(): ModeState {
  const now = Date.now();
  if (holder.state && holder.readAt && now - holder.readAt < RECHECK_MS) return holder.state;
  let next = holder.state ?? envDefault();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<ModeState>;
    next = {
      enabled: Boolean(raw.enabled),
      model: typeof raw.model === "string" && raw.model ? raw.model : null,
    };
  } catch {
    // No file yet (or unreadable): keep the in-memory / env value.
  }
  holder.state = next;
  holder.readAt = now;
  return next;
}

export function isOllamaMode(): boolean {
  return load().enabled;
}

/** The model chosen in the UI, or null to use OLLAMA_CHAT_MODEL. */
export function getSelectedOllamaModel(): string | null {
  return load().model;
}

export function setOllamaMode(enabled: boolean, model?: string | null): ModeState {
  const current = load();
  const next: ModeState = {
    enabled,
    model: model === undefined ? current.model : model || null,
  };
  holder.state = next;
  holder.readAt = Date.now();
  try {
    fs.writeFileSync(FILE, JSON.stringify(next));
  } catch {
    // Read-only filesystem (serverless): the in-memory value still applies.
  }
  return next;
}
