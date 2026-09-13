// ==========================================================
// LegalSetu — Node-only startup work
// ----------------------------------------------------------
// Split out of instrumentation.ts so the `node:dns` import is
// invisible to the bundler's static graph. instrumentation.ts still
// runs for the Edge runtime too (Next.js always loads it), and a
// literal `import "node:dns"` there — even behind a runtime check —
// gets flagged by Turbopack's analyzer regardless of the guard,
// because it inspects imports statically rather than tracing which
// branches actually execute. Dynamically importing this dedicated
// file instead keeps that import out of the Edge bundle entirely.
// ==========================================================

import dns from "node:dns";

/**
 * Prefer IPv4 when a hostname resolves to both families.
 *
 * Node has defaulted to "verbatim" order since v17, which means it
 * tries whatever the resolver returns first — and on NAT64 networks
 * (common on mobile hotspots and some ISPs) that is a synthesised
 * 64:ff9b::/96 address. If the network cannot actually route it, every
 * request to that host hangs for ~11 seconds and then fails with
 * UND_ERR_CONNECT_TIMEOUT.
 *
 * That is exactly what happened to api.sarvam.ai: curl was fine because
 * it races both families (Happy Eyeballs), while Node's fetch stalled on
 * the IPv6 address and voice mode went silent with a 502 per sentence.
 * Asking for IPv4 first restores the pre-v17 behaviour and costs nothing
 * on networks where IPv6 works.
 */
dns.setDefaultResultOrder("ipv4first");
