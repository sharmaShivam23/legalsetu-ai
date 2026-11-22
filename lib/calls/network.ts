// ==========================================================
// LegalSetu — network tuning for the voice bridge
// ----------------------------------------------------------
// A phone call makes a request to speech and AI services roughly every
// few seconds. On an ordinary connection that is fine; on a slow or lossy
// one, opening a NEW secure connection costs 1-5 seconds before any work
// begins — measured on the development machine, where the first speech
// recognition request took 3.1 s and the next two, on a warm connection,
// 0.8 s and 0.4 s.
//
// Node closes idle connections after 4 seconds, which is shorter than the
// gap between turns, so by default EVERY turn pays that cost again. Two
// fixes: keep connections open for a minute, and open them while the
// greeting is still playing.
// ==========================================================

/** Keep idle connections open between turns instead of closing them after 4 s. */
export async function keepConnectionsAlive(): Promise<void> {
  const { Agent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 600_000,
      connect: { timeout: 15_000 },
    })
  );
}

/**
 * Opens (and so pools) a connection to each host. Failures are ignored:
 * this is an optimisation, never a dependency.
 */
export async function preconnect(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map((url) =>
      fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) }).then(
        () => undefined,
        () => undefined
      )
    )
  );
}

/** The services a call talks to, as origins worth pre-connecting. */
export function callHosts(appUrl: string): string[] {
  return [
    appUrl,
    "https://api.groq.com",
    "https://generativelanguage.googleapis.com",
    "https://api.sarvam.ai",
  ];
}
