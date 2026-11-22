// ==========================================================
// LegalSetu — Twilio client (REST over fetch, no SDK)
// ----------------------------------------------------------
// The call is placed with the call's instructions (TwiML) sent inline
// in the request, so Twilio never has to fetch a URL from this app:
// only the audio WebSocket must be reachable from the internet. That
// keeps the app and database private and lets the same code run on
// Vercel (which cannot hold a WebSocket open) with the bridge hosted
// elsewhere.
// ==========================================================

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export class TwilioError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    message: string
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

/** The wss:// address Twilio should stream call audio to. */
export function bridgeStreamUrl(): string | null {
  const raw = process.env.CALL_BRIDGE_PUBLIC_URL?.trim();
  if (!raw) return null;
  const url = raw
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://")
    .replace(/\/+$/, "");
  return /^wss?:\/\//i.test(url) ? `${url}/media` : `wss://${url}/media`;
}

/** The same bridge, over plain HTTP — for its health check and warm-up endpoints. */
export function bridgeHttpUrl(): string | null {
  const raw = process.env.CALL_BRIDGE_PUBLIC_URL?.trim();
  if (!raw) return null;
  const url = raw
    .replace(/^ws:\/\//i, "http://")
    .replace(/^wss:\/\//i, "https://")
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** TwiML that connects the call to the bridge, then hangs up when it ends. */
export function buildStreamTwiml(streamUrl: string, token: string): string {
  return (
    `<Response><Connect><Stream url="${xmlEscape(streamUrl)}">` +
    `<Parameter name="token" value="${xmlEscape(token)}"/>` +
    `</Stream></Connect><Hangup/></Response>`
  );
}

async function twilioFetch(cfg: TwilioConfig, path: string, body?: URLSearchParams): Promise<any> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64"),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new TwilioError(res.status, json?.code ?? null, json?.message ?? `Twilio error ${res.status}`);
  return json;
}

export async function createCall(
  cfg: TwilioConfig,
  opts: { to: string; twiml: string; ringTimeoutSec?: number }
): Promise<{ sid: string; status: string }> {
  const body = new URLSearchParams({
    To: opts.to,
    From: cfg.from,
    Twiml: opts.twiml,
    Timeout: String(opts.ringTimeoutSec ?? 30),
  });
  const json = await twilioFetch(cfg, "/Calls.json", body);
  return { sid: json.sid, status: json.status };
}

export async function fetchCall(
  cfg: TwilioConfig,
  sid: string
): Promise<{ status: string; duration: number | null; startTime: string | null; endTime: string | null }> {
  const j = await twilioFetch(cfg, `/Calls/${sid}.json`);
  return {
    status: j.status,
    duration: j.duration != null ? Number(j.duration) : null,
    startTime: j.start_time ?? null,
    endTime: j.end_time ?? null,
  };
}

export async function hangupCall(cfg: TwilioConfig, sid: string): Promise<void> {
  await twilioFetch(cfg, `/Calls/${sid}.json`, new URLSearchParams({ Status: "completed" }));
}

export type CallStatus =
  | "REQUESTED"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "FAILED"
  | "CANCELED";

export const TERMINAL_STATUSES: CallStatus[] = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELED"];

/** Twilio's call status words -> ours. */
export function mapCallStatus(twilio: string): CallStatus {
  switch (twilio) {
    case "queued":
    case "initiated":
      return "REQUESTED";
    case "ringing":
      return "RINGING";
    case "in-progress":
      return "IN_PROGRESS";
    case "completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "no-answer":
      return "NO_ANSWER";
    case "canceled":
      return "CANCELED";
    default:
      return "FAILED";
  }
}

/** Twilio error codes -> something a user (or a developer on a trial account) can act on. */
export function explainTwilioError(err: TwilioError): string {
  switch (err.code) {
    case 21219:
    case 21608:
      return "This Twilio trial account can only call numbers you have verified in the Twilio console.";
    case 21215:
    case 21408:
    case 13227:
      return "Calls to India are not enabled on this Twilio account (Console → Voice → Geo permissions).";
    case 21211:
    case 21214:
      return "That phone number is not valid.";
    case 21210:
    case 21212:
    case 21606:
    case 21207:
      return "The calling number (TWILIO_PHONE_NUMBER) is not a number this Twilio account owns or has verified.";
    case 20003:
      return "Twilio rejected the account credentials — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.";
    case 20429:
      return "Too many call attempts right now. Please wait a minute and try again.";
    default:
      return `The phone service could not place the call (${err.code ?? err.status}).`;
  }
}
