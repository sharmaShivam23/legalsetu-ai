// @vitest-environment node
// ==========================================================
// Rights Clock API — integration tests against a real Postgres.
//
// Runs only when TEST_DATABASE_URL points at a disposable database
// that already has the schema applied, e.g.:
//
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/legalsetu_test \
//     npx vitest run tests/integration/rights-clock-api.test.ts
//
// The Prisma client is replaced with one hard-wired to that URL, so
// these tests can never write to the development or production DB.
// Auth and email are mocked; everything else — route handlers,
// validation, SQL, the engine, PDF rendering — is the real code.
// ==========================================================

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { addDays, todayInIndia } from "@/lib/rights-clock/dates";

const TEST_URL = process.env.TEST_DATABASE_URL;

const state = vi.hoisted(() => ({
  userId: null as string | null,
  sent: [] as { to: string; subject: string; text: string }[],
}));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  return { prisma: new Client({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "postgresql://invalid" } } }) };
});
vi.mock("@/lib/auth/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId, name: "Test User" } } : null),
}));
vi.mock("@/lib/email/mailer", () => ({
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    state.sent.push(m);
    return { delivered: true, devMode: false };
  },
}));

const db = new PrismaClient({ datasources: { db: { url: TEST_URL ?? "postgresql://invalid" } } });
const TODAY = todayInIndia();
const EMAILS = ["rc-test-a@example.com", "rc-test-b@example.com"];

function req(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => res.json() as Promise<any>;

/** A theft case whose default-bail right arises five days from today. */
function dueSoon(personName = "Ravi Kumar") {
  return {
    personName,
    relationship: "Brother",
    arrestDate: addDays(TODAY, -56),
    firstRemandDate: addDays(TODAY, -55),
    sections: ["303(2)", "3(5)"],
    priorConviction: "NO",
    otherPendingCases: "NO",
    firNumber: "0123/2026",
    policeStation: "Saket",
  };
}

describe.skipIf(!TEST_URL)("Rights Clock API (integration)", () => {
  let routes: {
    list: typeof import("@/app/api/rights-clock/route");
    one: typeof import("@/app/api/rights-clock/[id]/route");
    compute: typeof import("@/app/api/rights-clock/compute/route");
    application: typeof import("@/app/api/rights-clock/[id]/application/route");
    reminders: typeof import("@/app/api/rights-clock/reminders/route");
  };
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    await db.user.deleteMany({ where: { email: { in: EMAILS } } });
    userA = (await db.user.create({ data: { email: EMAILS[0], name: "Asha" } })).id;
    userB = (await db.user.create({ data: { email: EMAILS[1], name: "Bilal" } })).id;
    routes = {
      list: await import("@/app/api/rights-clock/route"),
      one: await import("@/app/api/rights-clock/[id]/route"),
      compute: await import("@/app/api/rights-clock/compute/route"),
      application: await import("@/app/api/rights-clock/[id]/application/route"),
      reminders: await import("@/app/api/rights-clock/reminders/route"),
    };
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: EMAILS } } });
    await db.$disconnect();
  });

  beforeEach(() => {
    state.userId = userA;
    state.sent = [];
  });

  describe("auth", () => {
    it("every route requires sign-in", async () => {
      state.userId = null;
      expect((await routes.list.GET()).status).toBe(401);
      expect((await routes.list.POST(req("/api/rights-clock", { method: "POST", body: dueSoon() }))).status).toBe(401);
      expect((await routes.compute.POST(req("/x", { method: "POST", body: {} }))).status).toBe(401);
      expect((await routes.one.GET(req("/x"), params("x"))).status).toBe(401);
      expect((await routes.application.GET(req("/x?kind=default-bail"), params("x"))).status).toBe(401);
    });
  });

  describe("compute", () => {
    it("returns a computation without saving anything", async () => {
      const before = await db.custodyTracker.count();
      const res = await routes.compute.POST(req("/x", { method: "POST", body: dueSoon() }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.result.defaultBail.status).toBe("UPCOMING");
      expect(body.data.result.defaultBail.periods[0].rightArisesOn).toBe(addDays(TODAY, 5));
      expect(await db.custodyTracker.count()).toBe(before);
    });

    it("rejects malformed input with 422", async () => {
      const res = await routes.compute.POST(req("/x", { method: "POST", body: { arrestDate: "yesterday", sections: [] } }));
      expect(res.status).toBe(422);
      expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("create / read / update / delete", () => {
    let trackerId: string;
    let caseId: string;

    it("creates a tracker and its case, with the next action synced", async () => {
      const res = await routes.list.POST(req("/api/rights-clock", { method: "POST", body: dueSoon() }));
      expect(res.status).toBe(201);
      const t = (await json(res)).data.tracker;
      trackerId = t.id;
      caseId = t.caseId;
      expect(t.input.sections).toEqual(["303(2)", "3(5)"]);
      expect(t.result.nextAction.due).toBe(addDays(TODAY, 5));

      const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.userId).toBe(userA);
      expect(c.title).toBe("Custody — Ravi Kumar");
      expect(c.nextAction).toMatch(/default bail/i);
      expect(c.nextActionDue?.toISOString().slice(0, 10)).toBe(addDays(TODAY, 5));
      expect(c.summary).toContain("FIR 0123/2026");
    });

    it("stores dates as calendar dates — no timezone shift", async () => {
      const row = await db.custodyTracker.findUniqueOrThrow({ where: { id: trackerId } });
      expect(row.arrestDate.toISOString()).toBe(`${addDays(TODAY, -56)}T00:00:00.000Z`);
    });

    it("lists and reads it back, recomputed", async () => {
      const list = await json(await routes.list.GET());
      expect(list.data.trackers.map((t: any) => t.id)).toContain(trackerId);
      const one = await json(await routes.one.GET(req("/x"), params(trackerId)));
      expect(one.data.tracker.result.computedOn).toBe(TODAY);
    });

    it("PATCH changes only the fields sent", async () => {
      const res = await routes.one.PATCH(req("/x", { method: "PATCH", body: { remindersEnabled: false } }), params(trackerId));
      expect(res.status).toBe(200);
      const row = await db.custodyTracker.findUniqueOrThrow({ where: { id: trackerId } });
      expect(row.remindersEnabled).toBe(false);
      // Not reset to the schema default "UNKNOWN":
      expect(row.priorConviction).toBe("NO");
      expect(row.sections).toEqual(["303(2)", "3(5)"]);
      expect(row.personName).toBe("Ravi Kumar");
    });

    it("recording the chargesheet updates the result and the case", async () => {
      const res = await routes.one.PATCH(
        req("/x", { method: "PATCH", body: { chargesheetFiledOn: addDays(TODAY, -1) } }),
        params(trackerId)
      );
      const t = (await json(res)).data.tracker;
      expect(t.result.defaultBail.status).toBe("CHARGESHEET_IN_TIME");
      const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.nextAction).toMatch(/479/);
    });

    it("rejects invalid updates", async () => {
      const res = await routes.one.PATCH(req("/x", { method: "PATCH", body: { arrestDate: "2026-02-30" } }), params(trackerId));
      expect(res.status).toBe(422);
    });

    it("DELETE removes the tracker but keeps the case", async () => {
      expect((await routes.one.DELETE(req("/x", { method: "DELETE" }), params(trackerId))).status).toBe(200);
      expect(await db.custodyTracker.findUnique({ where: { id: trackerId } })).toBeNull();
      expect(await db.case.findUnique({ where: { id: caseId } })).not.toBeNull();
      expect((await routes.one.GET(req("/x"), params(trackerId))).status).toBe(404);
    });
  });

  describe("user isolation", () => {
    it("another user's tracker is invisible and untouchable", async () => {
      state.userId = userB;
      const bTracker = (await json(await routes.list.POST(req("/x", { method: "POST", body: dueSoon("B's relative") })))).data.tracker;

      state.userId = userA;
      const list = await json(await routes.list.GET());
      expect(list.data.trackers.map((t: any) => t.id)).not.toContain(bTracker.id);
      expect((await routes.one.GET(req("/x"), params(bTracker.id))).status).toBe(404);
      expect(
        (await routes.one.PATCH(req("/x", { method: "PATCH", body: { personName: "hijacked" } }), params(bTracker.id))).status
      ).toBe(404);
      expect((await routes.one.DELETE(req("/x", { method: "DELETE" }), params(bTracker.id))).status).toBe(404);
      expect((await routes.application.GET(req("/x?kind=default-bail"), params(bTracker.id))).status).toBe(404);

      const row = await db.custodyTracker.findUniqueOrThrow({ where: { id: bTracker.id } });
      expect(row.personName).toBe("B's relative");
    });

    it("cannot attach a tracker to someone else's case", async () => {
      const bCase = await db.case.create({ data: { userId: userB, title: "B's case" } });
      const res = await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon(), caseId: bCase.id } }));
      expect(res.status).toBe(404);
    });

    it("never edits a case the user has closed", async () => {
      const closed = await db.case.create({
        data: { userId: userA, title: "Closed", status: "CLOSED", nextAction: "keep me" },
      });
      const res = await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon(), caseId: closed.id } }));
      expect(res.status).toBe(201);
      expect((await db.case.findUniqueOrThrow({ where: { id: closed.id } })).nextAction).toBe("keep me");
    });
  });

  describe("application PDFs", () => {
    it("renders a default-bail draft, refuses ones that do not apply, rejects unknown kinds", async () => {
      const t = (await json(await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon(), arrestDate: addDays(TODAY, -70), firstRemandDate: addDays(TODAY, -69) } })))).data.tracker;
      expect(t.result.defaultBail.status).toBe("AVAILABLE_NOW");

      const ok = await routes.application.GET(req(`/x?kind=default-bail`), params(t.id));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Content-Type")).toBe("application/pdf");
      expect(ok.headers.get("Cache-Control")).toContain("no-store");
      const bytes = Buffer.from(await ok.arrayBuffer());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

      const murder = (await json(await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon(), sections: ["103(1)"] } })))).data.tracker;
      const refused = await routes.application.GET(req(`/x?kind=section-479`), params(murder.id));
      expect(refused.status).toBe(409);
      expect((await json(refused)).error.message).toMatch(/does not fit/);

      expect((await routes.application.GET(req(`/x?kind=bogus`), params(t.id))).status).toBe(422);
    });
  });

  describe("reminder job", () => {
    const run = (secret?: string) =>
      routes.reminders.GET(req("/api/rights-clock/reminders", { headers: secret ? { Authorization: `Bearer ${secret}` } : {} }));

    it("is disabled without CRON_SECRET and rejects a wrong secret", async () => {
      delete process.env.CRON_SECRET;
      expect((await run("anything")).status).toBe(503);
      process.env.CRON_SECRET = "test-secret-value";
      expect((await run("wrong-secret-value")).status).toBe(401);
      expect((await run()).status).toBe(401);
    });

    it("emails due reminders once, records them, and is idempotent", async () => {
      process.env.CRON_SECRET = "test-secret-value";
      await db.custodyTracker.deleteMany({ where: { userId: { in: [userA, userB] } } });
      state.userId = userA;
      const t = (await json(await routes.list.POST(req("/x", { method: "POST", body: dueSoon("Reminder Person") })))).data.tracker;

      const first = await json(await run("test-secret-value"));
      expect(first.success).toBe(true);
      const mine = state.sent.filter((m) => m.to === EMAILS[0]);
      expect(mine).toHaveLength(1);
      expect(mine[0].subject).toContain("Reminder Person");
      expect(mine[0].text).toContain(`/dashboard/rights-clock/${t.id}`);
      expect(mine[0].text).not.toContain("303");

      const row = await db.custodyTracker.findUniqueOrThrow({ where: { id: t.id } });
      expect(row.remindersSent).toEqual([`DEFAULT_BAIL_60@${addDays(TODAY, 5)}:T-7`]);

      state.sent = [];
      await run("test-secret-value");
      expect(state.sent.filter((m) => m.to === EMAILS[0])).toHaveLength(0);
    });

    it("skips trackers with reminders off or the person released", async () => {
      process.env.CRON_SECRET = "test-secret-value";
      await db.custodyTracker.deleteMany({ where: { userId: { in: [userA, userB] } } });
      await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon("Off"), remindersEnabled: false } }));
      await routes.list.POST(req("/x", { method: "POST", body: { ...dueSoon("Released"), inCustody: false } }));
      await run("test-secret-value");
      expect(state.sent.filter((m) => m.to === EMAILS[0])).toHaveLength(0);
    });
  });

  describe("data lifecycle", () => {
    it("deleting the account deletes its trackers", async () => {
      const temp = await db.user.create({ data: { email: `rc-temp-${Date.now()}@example.com` } });
      state.userId = temp.id;
      const t = (await json(await routes.list.POST(req("/x", { method: "POST", body: dueSoon() })))).data.tracker;
      await db.user.delete({ where: { id: temp.id } });
      expect(await db.custodyTracker.findUnique({ where: { id: t.id } })).toBeNull();
    });
  });
});
