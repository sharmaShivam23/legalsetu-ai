// ==========================================================
// LegalSetu — phone numbers for the call feature
// ----------------------------------------------------------
// Only Indian mobile numbers are accepted. That is a product choice
// (the helpline is for people in India) and a cost/abuse control: an
// open "call any number in the world" endpoint is both expensive and
// a harassment tool.
//
// The number is never stored. A masked form is kept for display and a
// keyed hash lets us cap how often one number can be called without
// being able to recover it.
// ==========================================================

import { createHmac } from "node:crypto";

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

/**
 * Accepts the ways Indians actually write a mobile number:
 * "98765 43210", "+91-98765-43210", "09876543210", "919876543210".
 */
export function normalizeIndianMobile(input: string): PhoneResult {
  const cleaned = String(input ?? "").replace(/[\s\-().]/g, "");
  if (!cleaned) return { ok: false, reason: "Enter the phone number to call." };
  if (/[^\d+]/.test(cleaned) || cleaned.indexOf("+") > 0) {
    return { ok: false, reason: "A phone number can only contain digits." };
  }

  let digits = cleaned.replace(/^\+/, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

  if (!/^\d{10}$/.test(digits)) {
    return { ok: false, reason: "Enter a 10-digit Indian mobile number." };
  }
  if (!/^[6-9]/.test(digits)) {
    return { ok: false, reason: "Indian mobile numbers start with 6, 7, 8 or 9." };
  }
  return { ok: true, e164: `+91${digits}` };
}

/** "+919876543210" -> "+91 ••••• ••210" — enough to recognise, not to dial. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const national = digits.startsWith("91") ? digits.slice(2) : digits;
  return `+91 ••••• ••${national.slice(-3)}`;
}

export function hashPhone(e164: string, secret: string): string {
  return createHmac("sha256", secret).update(`phone:${e164}`).digest("hex");
}
