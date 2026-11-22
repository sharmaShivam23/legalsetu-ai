// ==========================================================
// Database connection resilience
// ----------------------------------------------------------
// The hosted Postgres (Neon) sleeps when idle and can take several seconds
// to accept a connection. Prisma's default 5 s connect timeout turns that
// into a random "Can't reach database server" 500 on whatever request
// happened to be first. Two small guards fix it:
//   1. a longer connect/pool timeout on the connection string, and
//   2. an automatic retry — but ONLY for errors where the query never ran
//      (could not connect), so a write can never be applied twice.
// ==========================================================

/** Adds connect_timeout / pool_timeout (seconds) unless the URL sets them. */
export function withConnectTimeout(url: string | undefined, seconds = 30): string | undefined {
  if (!url) return url;
  const add = (u: string, key: string) => (new RegExp(`[?&]${key}=`).test(u) ? u : `${u}${u.includes("?") ? "&" : "?"}${key}=${seconds}`);
  return add(add(url, "connect_timeout"), "pool_timeout");
}

/** True when the database could not be reached, i.e. the query did not run. */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; errorCode?: string; message?: string } | null;
  const code = e?.code ?? e?.errorCode;
  if (code === "P1001" || code === "P1002") return true; // can't reach / timed out reaching
  return /Can't reach database server|Timed out fetching a new connection/i.test(String(e?.message ?? ""));
}

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isConnectionError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}
