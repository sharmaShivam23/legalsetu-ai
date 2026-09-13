import { describe, it, expect, beforeEach } from "vitest";
import { issueOtp, verifyOtp, otpFailureMessage } from "@/lib/otp/otp";
import { prisma } from "@/lib/db/prisma";

const EMAIL = "otp-test-user@example.com";

describe("OTP issue and verify", () => {
  beforeEach(async () => {
    await prisma.otpCode.deleteMany({ where: { email: EMAIL } });
  });

  it("verifies a freshly issued code", async () => {
    const code = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    expect(code).toMatch(/^\d{6}$/);

    const result = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", code);
    expect(result.ok).toBe(true);
  });

  it("rejects an incorrect code", async () => {
    await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    const wrong = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", "000000");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe("INCORRECT");
  });

  it("cannot be redeemed twice", async () => {
    const code = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    const first = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", code);
    expect(first.ok).toBe(true);

    const second = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", code);
    expect(second.ok).toBe(false);
  });

  it("invalidates a prior code when a new one is issued", async () => {
    const first = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    const second = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    expect(first).not.toBe(second);

    const usingFirst = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", first);
    expect(usingFirst.ok).toBe(false);

    const usingSecond = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", second);
    expect(usingSecond.ok).toBe(true);
  });

  it("locks out after too many wrong attempts, even with the right code available", async () => {
    const code = await issueOtp(EMAIL, "EMAIL_VERIFICATION");

    for (let i = 0; i < 6; i++) {
      await verifyOtp(EMAIL, "EMAIL_VERIFICATION", "999999");
    }

    const attempt = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", code);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.reason).toBe("TOO_MANY_ATTEMPTS");
  });

  it("keeps EMAIL_VERIFICATION and PASSWORD_RESET codes independent", async () => {
    const verifyCode = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    const resetCode = await issueOtp(EMAIL, "PASSWORD_RESET");
    expect(verifyCode).not.toBe(resetCode);

    // The verification code must not unlock a password reset.
    const crossCheck = await verifyOtp(EMAIL, "PASSWORD_RESET", verifyCode);
    expect(crossCheck.ok).toBe(false);

    const correct = await verifyOtp(EMAIL, "PASSWORD_RESET", resetCode);
    expect(correct.ok).toBe(true);
  });

  it("fails cleanly when no code was ever issued", async () => {
    const result = await verifyOtp("never-issued@example.com", "EMAIL_VERIFICATION", "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
  });

  it("expired codes are rejected", async () => {
    const code = await issueOtp(EMAIL, "EMAIL_VERIFICATION");
    // Force the stored record into the past.
    await prisma.otpCode.updateMany({
      where: { email: EMAIL, purpose: "EMAIL_VERIFICATION", consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyOtp(EMAIL, "EMAIL_VERIFICATION", code);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
  });

  it("is case-insensitive on email", async () => {
    const code = await issueOtp("Mixed.Case@Example.com", "EMAIL_VERIFICATION");
    const result = await verifyOtp("mixed.case@example.com", "EMAIL_VERIFICATION", code);
    expect(result.ok).toBe(true);
    await prisma.otpCode.deleteMany({ where: { email: "mixed.case@example.com" } });
  });

  it("never returns a message that reveals the internal reason", () => {
    const messages = new Set([
      otpFailureMessage("NOT_FOUND"),
      otpFailureMessage("EXPIRED"),
    ]);
    // NOT_FOUND and EXPIRED are deliberately worded identically, so a
    // guess against a nonexistent code looks the same as a stale one.
    expect(messages.size).toBe(1);
  });
});
