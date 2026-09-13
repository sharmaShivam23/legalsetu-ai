// ==========================================================
// LegalSetu — server startup hook
// ----------------------------------------------------------
// Runs once when the Next.js server boots (dev and production),
// for BOTH the Node and Edge runtimes — hence the runtime check
// before pulling in anything Node-specific. See
// instrumentation.node.ts for what actually runs and why.
// ==========================================================

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./instrumentation.node");
}
