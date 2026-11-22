import { describe, it, expect, vi } from "vitest";
import { isConnectionError, withConnectTimeout, withDbRetry } from "@/lib/db/retry";

describe("withConnectTimeout", () => {
  it("adds both timeouts to a URL that already has a query string", () => {
    const out = withConnectTimeout("postgresql://u:p@h/db?sslmode=require", 30)!;
    expect(out).toContain("sslmode=require");
    expect(out).toContain("connect_timeout=30");
    expect(out).toContain("pool_timeout=30");
  });
  it("starts a query string when there is none", () => {
    expect(withConnectTimeout("postgresql://u:p@h/db", 20)).toBe("postgresql://u:p@h/db?connect_timeout=20&pool_timeout=20");
  });
  it("respects values already set", () => {
    const out = withConnectTimeout("postgresql://u:p@h/db?connect_timeout=5", 30)!;
    expect(out).toContain("connect_timeout=5");
    expect(out).not.toContain("connect_timeout=30");
  });
  it("passes undefined through", () => {
    expect(withConnectTimeout(undefined)).toBeUndefined();
  });
});

describe("isConnectionError", () => {
  it("recognises Prisma can't-reach errors", () => {
    expect(isConnectionError({ code: "P1001" })).toBe(true);
    expect(isConnectionError({ errorCode: "P1002" })).toBe(true);
    expect(isConnectionError(new Error("Can't reach database server at `host:5432`"))).toBe(true);
  });
  it("does not treat query errors as connection errors", () => {
    expect(isConnectionError({ code: "P2002" })).toBe(false); // unique violation
    expect(isConnectionError(new Error("boom"))).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("retries a connection failure and then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce({ code: "P1001" }).mockResolvedValue("ok");
    await expect(withDbRetry(fn, 3, 1)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("gives up after the last attempt and throws the error", async () => {
    const fn = vi.fn().mockRejectedValue({ code: "P1001" });
    await expect(withDbRetry(fn, 3, 1)).rejects.toEqual({ code: "P1001" });
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("never retries a non-connection error (a write could run twice)", async () => {
    const fn = vi.fn().mockRejectedValue({ code: "P2002" });
    await expect(withDbRetry(fn, 3, 1)).rejects.toEqual({ code: "P2002" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
