import { describe, it, expect, afterEach } from "vitest";
import { advocateMailTargets, demoOperatorEmails, isDemoOperator } from "@/lib/lawyers/demo-operator";

const KEYS = ["DEMO_ADVOCATE_OPERATORS", "ADMIN_EMAIL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("demoOperatorEmails", () => {
  it("parses a comma/space separated list, lower-cased and de-duplicated", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: " A@x.com, b@x.com ; a@X.com " });
    expect(demoOperatorEmails()).toEqual(["a@x.com", "b@x.com"]);
  });
  it("falls back to ADMIN_EMAIL when no operators are listed", () => {
    setEnv({ ADMIN_EMAIL: "admin@x.com" });
    expect(demoOperatorEmails()).toEqual(["admin@x.com"]);
  });
  it("is empty when nothing is configured", () => {
    setEnv({});
    expect(demoOperatorEmails()).toEqual([]);
  });
  it("ignores entries that are not email addresses", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: "nonsense, ok@x.com" });
    expect(demoOperatorEmails()).toEqual(["ok@x.com"]);
  });
});

describe("isDemoOperator", () => {
  it("accepts a listed email, case-insensitively", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: "me@x.com" });
    expect(isDemoOperator({ email: "ME@x.com", role: "USER" })).toBe(true);
  });
  it("accepts any admin", () => {
    setEnv({});
    expect(isDemoOperator({ email: "boss@x.com", role: "ADMIN" })).toBe(true);
  });
  it("rejects everyone else, including ordinary lawyers", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: "me@x.com" });
    expect(isDemoOperator({ email: "other@x.com", role: "LAWYER" })).toBe(false);
    expect(isDemoOperator({ email: "other@x.com", role: "USER" })).toBe(false);
  });
});

describe("advocateMailTargets", () => {
  it("sends a real advocate's mail to the advocate only", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: "op@x.com" });
    expect(advocateMailTargets({ isDemo: false }, "real@law.in")).toEqual(["real@law.in"]);
  });
  it("sends a demo advocate's mail to the operators", () => {
    setEnv({ DEMO_ADVOCATE_OPERATORS: "op1@x.com,op2@x.com" });
    expect(advocateMailTargets({ isDemo: true }, "fake@legalsetu-demo.example")).toEqual(["op1@x.com", "op2@x.com"]);
  });
  it("falls back to the advocate's own address when no operators exist", () => {
    setEnv({});
    expect(advocateMailTargets({ isDemo: true }, "fake@legalsetu-demo.example")).toEqual(["fake@legalsetu-demo.example"]);
  });
});
