// ==========================================================
// LegalSetu — signed call tokens
// ----------------------------------------------------------
// The voice bridge is a separate, internet-reachable process. Without
// a credential anyone who found its address could open a call stream
// and spend our speech and AI quota, or talk as another user. So every
// call carries a short-lived token, signed with a server-side secret,
// that names exactly which call, user and conversation it may act on.
// The same token authenticates the bridge's requests back to the app.
// ==========================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export interface CallTokenPayload {
  /** CallSession id. */
  cid: string;
  /** User the call belongs to. */
  uid: string;
  /** Conversation that receives the spoken transcript. */
  conv: string;
  /** App language code the call is conducted in. */
  lang: string;
  mode: "case" | "quick" | "knowledge";
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/**
 * The signing secret. CALL_BRIDGE_SECRET wins; otherwise one is derived
 * from AUTH_SECRET so a working app needs no extra configuration.
 */
export function callSecret(): string {
  const explicit = process.env.CALL_BRIDGE_SECRET?.trim();
  if (explicit) return explicit;
  const auth = process.env.AUTH_SECRET?.trim();
  if (!auth) throw new Error("Set CALL_BRIDGE_SECRET (or AUTH_SECRET) to enable phone calls.");
  return createHmac("sha256", auth).update("legalsetu-call-bridge").digest("hex");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signCallToken(payload: CallTokenPayload, secret = callSecret()): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload, or null for anything forged, malformed or expired. */
export function verifyCallToken(
  token: string | null | undefined,
  secret = callSecret(),
  nowSeconds = Math.floor(Date.now() / 1000)
): CallTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 2048) return null;

  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CallTokenPayload;
    if (!payload.cid || !payload.uid || !payload.conv || typeof payload.exp !== "number") return null;
    if (payload.exp < nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Reads `Authorization: CallToken <token>` from request headers. */
export function callTokenFromHeaders(headers: { get(name: string): string | null }): string | null {
  const value = headers.get("authorization");
  if (!value) return null;
  const match = value.match(/^CallToken\s+(\S+)$/i);
  return match ? match[1] : null;
}
