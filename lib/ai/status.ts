// ==========================================================
// LegalSetu — live AI provider status
// ----------------------------------------------------------
// The whole app runs on free-tier keys, and a free key fails in
// several different ways: out of credit, rate limited for the
// minute, spent for the day, revoked, or the provider simply
// overloaded. From the chat screen all of those looked identical
// ("unexpected error"), so there was no way to know which model to
// switch to. This probes every key of every model with a 1-token
// request and reports what is actually happening, plus whatever
// remaining-quota numbers the provider sends back.
//
// Probes cost real (tiny) quota, so results are cached briefly and
// concurrent callers share one in-flight check.
// ==========================================================

import { AI_MODELS, getAutoFallbackSequence, type AIModel } from "./models";
import { getKeysForProvider } from "./key-pool";
import { GROQ_OVERFLOW_MODELS } from "./groq";

export type Health =
  | "working"
  | "rate_limited"
  | "daily_limit"
  | "no_credits"
  | "invalid_key"
  | "overloaded"
  | "unavailable"
  | "not_configured";

export interface KeyProbe {
  health: Health;
  latencyMs: number;
  /** Requests left in the provider's current window (Groq: per day). */
  remainingRequests?: number;
  limitRequests?: number;
  /** Tokens left in the provider's current window (Groq: per minute). */
  remainingTokens?: number;
  detail?: string;
}

export interface ModelStatus {
  id: string;
  name: string;
  provider: string;
  apiModel: string;
  health: Health;
  workingKeys: number;
  totalKeys: number;
  remainingRequests?: number;
  limitRequests?: number;
  detail?: string;
}

export interface ServiceStatus {
  id: string;
  name: string;
  health: Health;
  workingKeys: number;
  totalKeys: number;
  detail?: string;
}

export interface AIStatusReport {
  checkedAt: string;
  models: ModelStatus[];
  services: ServiceStatus[];
  /** Which provider "Auto" would use right now. */
  autoServedBy: string | null;
}

const KEY_PREFIX: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  opencode: "OPENCODE_API_KEY",
};

const OPENAI_COMPATIBLE_URL: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  opencode: `${process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1"}/chat/completions`,
};

const PROBE_TIMEOUT_MS = 12_000;

/** Turns an HTTP status and error body into one of the Health values. */
export function classify(status: number, body: string): { health: Health; detail?: string } {
  const text = body.toLowerCase();
  const short = body.replace(/\s+/g, " ").slice(0, 140);
  if (status >= 200 && status < 300) return { health: "working" };
  if (
    status === 402 ||
    /no credits|credit balance|insufficient balance|insufficient_quota|billing|add credits/.test(text)
  ) {
    return { health: "no_credits", detail: "Account has no credit left" };
  }
  if (/free tier can only be used/.test(text)) {
    return { health: "unavailable", detail: "Free tier only works inside OpenCode's own app" };
  }
  if (status === 401 || status === 403 || /invalid api key|api key not valid|denied access|permission_denied/.test(text)) {
    return { health: "invalid_key", detail: "Key rejected (revoked, wrong, or project blocked)" };
  }
  if (status === 429) {
    if (/per day|daily|tokens per day|requests per day|rpd|tpd|quota exceeded for metric.*per ?day/.test(text)) {
      return { health: "daily_limit", detail: "Daily free limit used up — resets tomorrow" };
    }
    return { health: "rate_limited", detail: "Rate limited right now — usually clears within a minute" };
  }
  if (status === 503 || status === 500 || status === 529 || /high demand|overloaded|unavailable/.test(text)) {
    return { health: "overloaded", detail: "Provider is overloaded — temporary" };
  }
  if (status === 404 || /not found|does not exist|not a valid model|is not supported/.test(text)) {
    return { health: "unavailable", detail: "Model not available" };
  }
  return { health: "unavailable", detail: `HTTP ${status}: ${short}` };
}

function num(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function timed(run: () => Promise<Response>): Promise<{ res?: Response; error?: unknown; ms: number }> {
  const t = Date.now();
  try {
    return { res: await run(), ms: Date.now() - t };
  } catch (error) {
    return { error, ms: Date.now() - t };
  }
}

async function probeKey(provider: string, apiModel: string, key: string): Promise<KeyProbe> {
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  let call: () => Promise<Response>;

  if (provider === "gemini") {
    call = () =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal,
        }
      );
  } else if (provider === "anthropic") {
    call = () =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: apiModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal,
      });
  } else {
    call = () =>
      fetch(OPENAI_COMPATIBLE_URL[provider], {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: apiModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal,
      });
  }

  const { res, error, ms } = await timed(call);
  if (!res) {
    const timedOut = String((error as any)?.name ?? error).includes("Timeout");
    return {
      health: timedOut ? "overloaded" : "unavailable",
      latencyMs: ms,
      detail: timedOut ? "No response within 12s — provider overloaded" : "Could not connect",
    };
  }

  const body = res.ok ? "" : await res.text().catch(() => "");
  // Gemini returns 200 with MAX_TOKENS for a 1-token cap, which is fine.
  const { health, detail } = classify(res.status, body);
  const h = res.headers;
  return {
    health,
    detail,
    latencyMs: ms,
    remainingRequests: num(h.get("x-ratelimit-remaining-requests") ?? h.get("anthropic-ratelimit-requests-remaining")),
    limitRequests: num(h.get("x-ratelimit-limit-requests") ?? h.get("anthropic-ratelimit-requests-limit")),
    remainingTokens: num(h.get("x-ratelimit-remaining-tokens") ?? h.get("anthropic-ratelimit-tokens-remaining")),
  };
}

/** Best health first: one working key makes the model usable. */
const HEALTH_RANK: Health[] = [
  "working",
  "rate_limited",
  "overloaded",
  "daily_limit",
  "no_credits",
  "invalid_key",
  "unavailable",
  "not_configured",
];

function summarise(probes: KeyProbe[]): Pick<ModelStatus, "health" | "workingKeys" | "remainingRequests" | "limitRequests" | "detail"> {
  if (probes.length === 0) {
    return { health: "not_configured", workingKeys: 0, detail: "No API key in .env" };
  }
  const best = [...probes].sort((a, b) => HEALTH_RANK.indexOf(a.health) - HEALTH_RANK.indexOf(b.health))[0];
  const working = probes.filter((p) => p.health === "working");
  const withCounts = probes.filter((p) => p.remainingRequests !== undefined);
  return {
    health: best.health,
    workingKeys: working.length,
    remainingRequests: withCounts.length ? withCounts.reduce((n, p) => n + (p.remainingRequests ?? 0), 0) : undefined,
    limitRequests: withCounts.length ? withCounts.reduce((n, p) => n + (p.limitRequests ?? 0), 0) : undefined,
    detail: best.health === "working" ? undefined : best.detail,
  };
}

async function probeModel(model: { id: string; name: string; provider: string; apiModel: string }): Promise<ModelStatus> {
  const keys = getKeysForProvider(KEY_PREFIX[model.provider] ?? "");
  const probes = await Promise.all(keys.map((k) => probeKey(model.provider, model.apiModel, k)));
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    apiModel: model.apiModel,
    totalKeys: keys.length,
    ...summarise(probes),
  };
}

async function probeEmbeddings(): Promise<ServiceStatus> {
  const keys = getKeysForProvider("GEMINI_API_KEY");
  const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  const probes = await Promise.all(
    keys.map(async (key): Promise<KeyProbe> => {
      const { res, ms } = await timed(() =>
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { parts: [{ text: "hi" }] } }),
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
      );
      if (!res) return { health: "overloaded", latencyMs: ms, detail: "No response" };
      return { ...classify(res.status, res.ok ? "" : await res.text().catch(() => "")), latencyMs: ms };
    })
  );
  const s = summarise(probes);
  return {
    id: "embeddings",
    name: "Legal source search (Gemini embeddings)",
    health: s.health,
    workingKeys: s.workingKeys,
    totalKeys: keys.length,
    detail: s.detail,
  };
}

async function probeVoice(): Promise<ServiceStatus> {
  // Every key, including ones the app has benched for credit, so the
  // report shows the true count.
  const keys = [process.env.SARVAM_API_KEY, ...Array.from({ length: 5 }, (_, i) => process.env[`SARVAM_API_KEY_${i + 1}`])]
    .map((k) => k?.trim())
    .filter((k, i, a): k is string => Boolean(k) && a.indexOf(k) === i);
  const probes = await Promise.all(
    keys.map(async (key): Promise<KeyProbe> => {
      const { res, ms } = await timed(() =>
        fetch("https://api.sarvam.ai/text-to-speech", {
          method: "POST",
          headers: { "api-subscription-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ text: "ok", language_code: "en-IN", model: "bulbul:v3", speaker: "ritu" }),
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
      );
      if (!res) return { health: "overloaded", latencyMs: ms, detail: "No response" };
      return { ...classify(res.status, res.ok ? "" : await res.text().catch(() => "")), latencyMs: ms };
    })
  );
  const s = summarise(probes);
  return {
    id: "voice",
    name: "Voice (Sarvam speech)",
    health: s.health,
    workingKeys: s.workingKeys,
    totalKeys: keys.length,
    detail: s.detail,
  };
}

const CACHE_MS = 2 * 60 * 1000;
let cached: { at: number; report: AIStatusReport } | null = null;
let inFlight: Promise<AIStatusReport> | null = null;

export async function getAIStatus(force = false): Promise<AIStatusReport> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.report;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const targets = AI_MODELS.map((m: AIModel) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      apiModel: m.getApiId(),
    }));
    // Groq's overflow models carry their own free quota, so show them too.
    for (const apiModel of GROQ_OVERFLOW_MODELS) {
      targets.push({ id: `groq-overflow:${apiModel}`, name: `Groq backup (${apiModel})`, provider: "groq", apiModel });
    }

    const [models, embeddings, voice] = await Promise.all([
      Promise.all(targets.map(probeModel)),
      probeEmbeddings(),
      probeVoice(),
    ]);

    const byId = new Map(models.map((m) => [m.id, m]));
    const auto = getAutoFallbackSequence().find((m) => byId.get(m.id)?.health === "working");

    const report: AIStatusReport = {
      checkedAt: new Date().toISOString(),
      models,
      services: [embeddings, voice],
      autoServedBy: auto ? auto.name : null,
    };
    cached = { at: Date.now(), report };
    return report;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
