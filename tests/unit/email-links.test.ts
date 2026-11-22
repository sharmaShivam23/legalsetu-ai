import { describe, it, expect, afterEach } from "vitest";
import { emailBaseUrl, emailLink } from "@/lib/email/links";

const KEYS = ["EMAIL_LINK_BASE_URL", "NEXT_PUBLIC_APP_URL", "AUTH_URL"] as const;
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

describe("email links", () => {
  it("uses EMAIL_LINK_BASE_URL over the localhost app URL", () => {
    setEnv({ EMAIL_LINK_BASE_URL: "https://legalsetu-ai.vercel.app", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    expect(emailLink("/dashboard/consultations/abc")).toBe("https://legalsetu-ai.vercel.app/dashboard/consultations/abc");
  });

  it("strips trailing slashes so there is never a double slash", () => {
    setEnv({ EMAIL_LINK_BASE_URL: "https://legalsetu-ai.vercel.app/" });
    expect(emailBaseUrl()).toBe("https://legalsetu-ai.vercel.app");
    expect(emailLink("/x")).toBe("https://legalsetu-ai.vercel.app/x");
  });

  it("falls back to the app URL, then AUTH_URL, then localhost", () => {
    setEnv({ NEXT_PUBLIC_APP_URL: "https://app.example.com" });
    expect(emailBaseUrl()).toBe("https://app.example.com");
    setEnv({ AUTH_URL: "https://auth.example.com" });
    expect(emailBaseUrl()).toBe("https://auth.example.com");
    setEnv({});
    expect(emailBaseUrl()).toBe("http://localhost:3000");
  });

  it("ignores a blank EMAIL_LINK_BASE_URL", () => {
    setEnv({ EMAIL_LINK_BASE_URL: "   ", NEXT_PUBLIC_APP_URL: "https://app.example.com" });
    expect(emailBaseUrl()).toBe("https://app.example.com");
  });

  it("adds a leading slash to a bare path", () => {
    setEnv({ EMAIL_LINK_BASE_URL: "https://site.test" });
    expect(emailLink("dashboard")).toBe("https://site.test/dashboard");
  });
});
