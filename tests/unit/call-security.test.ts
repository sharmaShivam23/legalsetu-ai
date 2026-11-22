import { describe, it, expect } from "vitest";
import { normalizeIndianMobile, maskPhone, hashPhone } from "@/lib/calls/phone";
import { signCallToken, verifyCallToken, callTokenFromHeaders, type CallTokenPayload } from "@/lib/calls/token";
import {
  buildStreamTwiml,
  bridgeStreamUrl,
  mapCallStatus,
  explainTwilioError,
  TwilioError,
} from "@/lib/calls/twilio";
import { isEmergency } from "@/lib/calls/emergency";

describe("Indian mobile numbers", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(+91) 7000 000 001", "+917000000001"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeIndianMobile(input)).toEqual({ ok: true, e164: expected });
  });

  it.each([
    "", "12345", "5876543210", "98765432101", "+1 415 555 0132", "abcdefghij", "98765-43210x", "+98765+43210",
  ])("rejects %j", (input) => {
    expect(normalizeIndianMobile(input).ok).toBe(false);
  });

  it("masks all but the last three digits and never leaks the rest", () => {
    const masked = maskPhone("+919876543210");
    expect(masked).toBe("+91 ••••• ••210");
    expect(masked).not.toContain("9876");
  });

  it("hashes consistently per secret and differently across numbers and secrets", () => {
    expect(hashPhone("+919876543210", "s")).toBe(hashPhone("+919876543210", "s"));
    expect(hashPhone("+919876543210", "s")).not.toBe(hashPhone("+919876543211", "s"));
    expect(hashPhone("+919876543210", "s")).not.toBe(hashPhone("+919876543210", "t"));
  });
});

const payload = (over: Partial<CallTokenPayload> = {}): CallTokenPayload => ({
  cid: "call-1", uid: "user-1", conv: "conv-1", lang: "hi", mode: "case", exp: 2_000_000_000, ...over,
});

describe("call tokens", () => {
  it("verifies a token it signed", () => {
    expect(verifyCallToken(signCallToken(payload(), "secret"), "secret", 1_900_000_000)).toEqual(payload());
  });

  it("rejects a token signed with a different secret", () => {
    expect(verifyCallToken(signCallToken(payload(), "secret"), "other", 1_900_000_000)).toBeNull();
  });

  it("rejects a tampered payload (swapping in another user)", () => {
    const token = signCallToken(payload(), "secret");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify(payload({ uid: "victim" }))).toString("base64url");
    expect(verifyCallToken(`${forged}.${sig}`, "secret", 1_900_000_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(verifyCallToken(signCallToken(payload({ exp: 1000 }), "secret"), "secret", 2000)).toBeNull();
  });

  it.each([null, undefined, "", "nodot", ".sig", "a.b.c", "x".repeat(3000)])("rejects garbage %j", (t) => {
    expect(verifyCallToken(t as any, "secret", 1)).toBeNull();
  });

  it("reads the token from an Authorization header", () => {
    const h = (v: string | null) => ({ get: () => v });
    expect(callTokenFromHeaders(h("CallToken abc.def"))).toBe("abc.def");
    expect(callTokenFromHeaders(h("Bearer abc.def"))).toBeNull();
    expect(callTokenFromHeaders(h(null))).toBeNull();
  });
});

describe("Twilio helpers", () => {
  it("builds TwiML that streams to the bridge and escapes attacker-controlled characters", () => {
    const twiml = buildStreamTwiml('wss://x.example/media?a=1&b="2"', "tok<en>");
    expect(twiml).toContain('<Stream url="wss://x.example/media?a=1&amp;b=&quot;2&quot;">');
    expect(twiml).toContain('<Parameter name="token" value="tok&lt;en&gt;"/>');
    expect(twiml.endsWith("<Hangup/></Response>")).toBe(true);
  });

  it("turns any public URL form into the wss media endpoint", () => {
    const saved = process.env.CALL_BRIDGE_PUBLIC_URL;
    for (const [input, out] of [
      ["https://abc.trycloudflare.com", "wss://abc.trycloudflare.com/media"],
      ["https://abc.trycloudflare.com/", "wss://abc.trycloudflare.com/media"],
      ["http://localhost:8787", "ws://localhost:8787/media"],
      ["abc.example.com", "wss://abc.example.com/media"],
    ]) {
      process.env.CALL_BRIDGE_PUBLIC_URL = input;
      expect(bridgeStreamUrl()).toBe(out);
    }
    delete process.env.CALL_BRIDGE_PUBLIC_URL;
    expect(bridgeStreamUrl()).toBeNull();
    if (saved) process.env.CALL_BRIDGE_PUBLIC_URL = saved;
  });

  it("maps Twilio statuses", () => {
    expect(mapCallStatus("in-progress")).toBe("IN_PROGRESS");
    expect(mapCallStatus("no-answer")).toBe("NO_ANSWER");
    expect(mapCallStatus("completed")).toBe("COMPLETED");
    expect(mapCallStatus("queued")).toBe("REQUESTED");
    expect(mapCallStatus("surprise")).toBe("FAILED");
  });

  it("explains the errors a trial account actually hits", () => {
    expect(explainTwilioError(new TwilioError(400, 21219, "x"))).toMatch(/verified/);
    expect(explainTwilioError(new TwilioError(403, 21215, "x"))).toMatch(/India/);
    expect(explainTwilioError(new TwilioError(400, 21212, "x"))).toMatch(/TWILIO_PHONE_NUMBER/);
    // The error a trial account gets when the calling number is not one it owns or has verified.
    expect(explainTwilioError(new TwilioError(400, 21210, "x"))).toMatch(/TWILIO_PHONE_NUMBER/);
  });
});

describe("emergency detection", () => {
  it.each([
    "he is beating me right now",
    "I want to die",
    "they kidnapped my son",
    "I am being attacked",
    "मुझे आत्महत्या के ख्याल आ रहे हैं",
    "वो मुझे जान से मारने की धमकी दे रहा है",
    "मेरे साथ बलात्कार हुआ",
    "वो मुझे मार रहा है",
  ])("flags %j", (text) => expect(isEmergency(text)).toBe(true));

  it.each([
    "my landlord has not returned my security deposit",
    "someone stole my phone yesterday evening",
    "he had a knife when he snatched my bag last week",
    "दुकानदार ने दुकान बंद कर दिया और पैसे नहीं लौटाए",
    "मकान मालिक ने मेरा डिपॉजिट वापस नहीं किया",
    "I want to file a consumer complaint about a refund",
    "the fire department issued a notice about my building",
  ])("does not flag ordinary case descriptions: %j", (text) => expect(isEmergency(text)).toBe(false));
});
