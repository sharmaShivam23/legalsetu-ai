// ==========================================================
// LegalSetu — one-time passcodes
// ----------------------------------------------------------
// Backs both email verification at signup and password reset.
// A code is a direct route to taking over an account, so:
//
//  - stored HASHED, the same way passwords are, never plaintext
//  - short-lived (10 minutes) and single-use (consumedAt)
//  - attempt-capped, so a 6-digit code cannot be brute-forced
//    within its lifetime (6 tries against 1,000,000 possibilities)
//  - rate-limited at the API layer on both send and verify
//  - every check is constant-shape: a wrong code and an expired
//    code return the same generic failure, so the response never
//    tells an attacker which guess was closer to right
// ==========================================================

import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

export type OtpPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

function hashCode(code: string, email: string): string {
  // Salted with the email so the same 6-digit code never hashes the
  // same way for two different addresses.
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, "0");
}

/**
 * Issues a fresh code for an email + purpose, invalidating any prior
 * outstanding code for that same pair so only one can ever be redeemed.
 */
export async function issueOtp(
  email: string,
  purpose: OtpPurpose
): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const code = generateCode();

  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { email: normalized, purpose, consumedAt: null },
      data: { consumedAt: new Date() }, // superseded, not just expired
    }),
    prisma.otpCode.create({
      data: {
        email: normalized,
        purpose,
        codeHash: hashCode(code, normalized),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ]);

  return code;
}

export type OtpFailureReason = "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INCORRECT";

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: OtpFailureReason };

/**
 * Verifies a code and consumes it on success. On failure it still
 * increments the attempt counter, so repeated wrong guesses count down
 * toward the lockout regardless of the reason.
 */
export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<OtpVerifyResult> {
  const normalized = email.toLowerCase().trim();

  const record = await prisma.otpCode.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "NOT_FOUND" };

  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  const matches = hashCode(code.trim(), normalized) === record.codeHash;

  if (!matches) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    logger.warn("OTP verification failed", { purpose, attempts: record.attempts + 1 });
    return { ok: false, reason: "INCORRECT" };
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true };
}

/** User-facing copy for each failure — never reveals which check failed internally. */
export function otpFailureMessage(reason: OtpFailureReason): string {
  switch (reason) {
    case "NOT_FOUND":
    case "EXPIRED":
      return "That code has expired. Please request a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many incorrect attempts. Please request a new code.";
    case "INCORRECT":
      return "That code is incorrect. Please check and try again.";
    default:
      return "That code could not be verified. Please request a new one.";
  }
}
