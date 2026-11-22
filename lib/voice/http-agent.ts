// ==========================================================
// LegalSetu — one kept-alive connection pool for voice providers
// ----------------------------------------------------------
// Node's fetch closes an idle connection after ~4 s. Spoken turns are
// 10-30 s apart, so every utterance paid a fresh TCP + TLS handshake to
// Groq / Sarvam — measured at ~400 ms extra per call from India (0.9 s vs
// 0.5 s for the same clip). Holding connections open for a minute keeps
// a conversation on a warm connection.
// ==========================================================

import { Agent } from "undici";

const g = globalThis as unknown as { __legalsetuVoiceAgent?: Agent };

export const voiceAgent: Agent = (g.__legalsetuVoiceAgent ??= new Agent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 5 * 60_000,
}));

/** RequestInit extended with the undici dispatcher Node's fetch accepts. */
export type VoiceFetchInit = RequestInit & { dispatcher?: Agent };
