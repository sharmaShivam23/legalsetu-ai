import { describe, it, expect, vi } from "vitest";
import { readApi } from "@/components/lawyers/api";
import { safeRoute } from "@/lib/lawyers/http";

vi.mock("@/lib/lawyers/server", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: vi.fn(), RATE_LIMITS: {} }));

describe("readApi", () => {
  it("returns the parsed body for a normal JSON response", async () => {
    const res = new Response(JSON.stringify({ success: true, data: { n: 1 } }), { status: 200 });
    expect(await readApi(res)).toEqual({ success: true, data: { n: 1 } });
  });

  it("does not throw on an EMPTY body (the 'Unexpected end of JSON input' crash)", async () => {
    const out = await readApi(new Response("", { status: 500 }));
    expect(out.success).toBe(false);
    expect(out.error.code).toBe("BAD_RESPONSE");
    expect(out.error.message).toMatch(/server had a problem/i);
  });

  it("does not throw on an HTML error page", async () => {
    const out = await readApi(new Response("<html>Internal Server Error</html>", { status: 502 }));
    expect(out.success).toBe(false);
  });

  it("uses a different message for a non-5xx bad body", async () => {
    const out = await readApi(new Response("nope", { status: 200 }));
    expect(out.error.message).toMatch(/unexpected response/i);
  });
});

describe("safeRoute", () => {
  it("passes a normal response straight through", async () => {
    const ok = safeRoute("t", async () => new Response("fine", { status: 201 }));
    const res = await ok();
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("fine");
  });

  it("turns an unexpected exception into a JSON 500 instead of an empty one", async () => {
    const boom = safeRoute("t", async () => {
      throw new Error("Can't reach database server");
    });
    const res = await boom();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("SERVER_ERROR");
  });

  it("forwards the handler's arguments", async () => {
    const echo = safeRoute("t", async (a: string, b: number) => new Response(`${a}-${b}`));
    expect(await (await echo("x", 2)).text()).toBe("x-2");
  });
});
