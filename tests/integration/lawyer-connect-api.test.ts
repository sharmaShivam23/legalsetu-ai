// @vitest-environment node
// ==========================================================
// Verified Lawyer Connect — integration tests against a real Postgres
// and real (temporary) file storage.
//
//   TEST_DATABASE_URL=postgresql://…/legalsetu_test \
//     npx vitest run tests/integration/lawyer-connect-api.test.ts
//
// Skipped unless TEST_DATABASE_URL is set. The Prisma client is
// hard-wired to that URL. Auth and email are mocked; the outbound
// geocoder call is stubbed. Everything else is the real code.
// ==========================================================

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import path from "path";
import { addDays, todayInIndia } from "@/lib/rights-clock/dates";

const TEST_URL = process.env.TEST_DATABASE_URL;

const state = vi.hoisted(() => {
  // vi.hoisted runs before ES imports are bound, so require() is the only option here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "ls-int-"));
  process.env.STORAGE_LOCAL_DIR = dir;
  process.env.RATE_LIMIT_ENABLED = "false";
  return { userId: null as string | null, sent: [] as { to: string; subject: string; text: string }[], storageDir: dir as string };
});

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  return { prisma: new Client({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "postgresql://invalid" } } }) };
});
vi.mock("@/lib/auth/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
vi.mock("@/lib/email/mailer", () => ({
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    state.sent.push(m);
    return { delivered: true, devMode: false };
  },
}));

let geocoderDown = false;
const db = new PrismaClient({ datasources: { db: { url: TEST_URL ?? "postgresql://invalid" } } });
const DOMAIN = "lc-int.example";
const TODAY = todayInIndia();

// ---------- request helpers ----------
function req(url: string, init?: { method?: string; body?: unknown; form?: FormData }) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    ...(init?.form
      ? { body: init.form }
      : { headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) }),
  });
}
const P = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (r: Response) => r.json() as Promise<any>;
const as = (id: string | null) => {
  state.userId = id;
};

// ---------- tiny real files ----------
function jpegWithGps(): Buffer {
  const seg = (m: number, p: Buffer) => {
    const l = Buffer.alloc(2);
    l.writeUInt16BE(p.length + 2);
    return Buffer.concat([Buffer.from([0xff, m]), l, p]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=28.52 home", "latin1")),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 1, 2, 9, 9, 0xff, 0xd9]),
  ]);
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
function fileForm(buf: Buffer, fields: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append("file", new Blob([new Uint8Array(buf)]), "upload.bin");
  return f;
}

const PROFILE = {
  fullName: "Test Advocate One",
  gender: "FEMALE",
  barCouncil: "DL",
  enrolmentNumber: "D/7001/2015",
  enrolmentYear: 2015,
  practiceAreas: ["CRIMINAL", "FAMILY"],
  courts: ["DISTRICT"],
  languages: ["en", "hi"],
  bio: "Bail and family matters at Saket District Court.",
  officeAddress: "Chamber 1, Saket District Court",
  city: "New Delhi",
  pincode: "110017",
  latitude: 28.5245,
  longitude: 77.2066,
  legalAidPanel: true,
};

describe.skipIf(!TEST_URL)("Verified Lawyer Connect API (integration)", () => {
  let R: {
    register: typeof import("@/app/api/auth/register/route");
    profile: typeof import("@/app/api/lawyer/profile/route");
    photo: typeof import("@/app/api/lawyer/profile/photo/route");
    submit: typeof import("@/app/api/lawyer/profile/submit/route");
    docs: typeof import("@/app/api/lawyer/documents/route");
    doc: typeof import("@/app/api/lawyer/documents/[docId]/route");
    search: typeof import("@/app/api/lawyers/route");
    lawyer: typeof import("@/app/api/lawyers/[id]/route");
    lawyerPhoto: typeof import("@/app/api/lawyers/[id]/photo/route");
    location: typeof import("@/app/api/location/route");
    cons: typeof import("@/app/api/consultations/route");
    con: typeof import("@/app/api/consultations/[id]/route");
    msgs: typeof import("@/app/api/consultations/[id]/messages/route");
    shares: typeof import("@/app/api/consultations/[id]/shares/route");
    share: typeof import("@/app/api/consultations/[id]/shares/[shareId]/route");
    caseView: typeof import("@/app/api/consultations/[id]/cases/[caseId]/route");
    deadlines: typeof import("@/app/api/advocate/deadlines/route");
    adminList: typeof import("@/app/api/admin/lawyers/route");
    adminOne: typeof import("@/app/api/admin/lawyers/[id]/route");
    review: typeof import("@/app/api/admin/lawyers/[id]/review/route");
  };
  let admin: string, lawyerU: string, citizen: string, other: string;
  let profileId: string;

  const mkUser = (local: string, role: "USER" | "ADMIN" | "LAWYER" = "USER") =>
    db.user.create({ data: { email: `${local}@${DOMAIN}`, name: `${local} Person`, role, emailVerified: new Date() } }).then((u) => u.id);

  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
    admin = await mkUser("admin", "ADMIN");
    lawyerU = await mkUser("lawyer");
    citizen = await mkUser("citizen");
    other = await mkUser("other");
    R = {
      register: await import("@/app/api/auth/register/route"),
      profile: await import("@/app/api/lawyer/profile/route"),
      photo: await import("@/app/api/lawyer/profile/photo/route"),
      submit: await import("@/app/api/lawyer/profile/submit/route"),
      docs: await import("@/app/api/lawyer/documents/route"),
      doc: await import("@/app/api/lawyer/documents/[docId]/route"),
      search: await import("@/app/api/lawyers/route"),
      lawyer: await import("@/app/api/lawyers/[id]/route"),
      lawyerPhoto: await import("@/app/api/lawyers/[id]/photo/route"),
      location: await import("@/app/api/location/route"),
      cons: await import("@/app/api/consultations/route"),
      con: await import("@/app/api/consultations/[id]/route"),
      msgs: await import("@/app/api/consultations/[id]/messages/route"),
      shares: await import("@/app/api/consultations/[id]/shares/route"),
      share: await import("@/app/api/consultations/[id]/shares/[shareId]/route"),
      caseView: await import("@/app/api/consultations/[id]/cases/[caseId]/route"),
      deadlines: await import("@/app/api/advocate/deadlines/route"),
      adminList: await import("@/app/api/admin/lawyers/route"),
      adminOne: await import("@/app/api/admin/lawyers/[id]/route"),
      review: await import("@/app/api/admin/lawyers/[id]/review/route"),
    };
    // Geocoding goes to Nominatim — stub it, never hit the network.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (geocoderDown) return new Response("busy", { status: 503 });
        const place = { lat: "28.5245", lon: "77.2066", address: { suburb: "Saket", city: "New Delhi", postcode: "110017" } };
        return new Response(JSON.stringify(String(url).includes("/search") ? [place] : place), { status: 200 });
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
    await db.$disconnect();
    rmSync(state.storageDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    state.sent = [];
  });

  // ------------------------------------------------------------------
  describe("sign-up as an advocate", () => {
    it("register with accountType LAWYER creates a LAWYER account", async () => {
      const res = await R.register.POST(
        req("/api/auth/register", { method: "POST", body: { name: "New Advocate", email: `newadv@${DOMAIN}`, password: "Str0ngPassw0rd!", accountType: "LAWYER", location: { address: "12 Press Enclave Marg, Saket, New Delhi", pincode: "110017" } } })
      );
      expect(res.status).toBe(201);
      const u = await db.user.findUniqueOrThrow({ where: { email: `newadv@${DOMAIN}` } });
      expect(u.role).toBe("LAWYER");
      const c = await R.register.POST(
        req("/api/auth/register", { method: "POST", body: { name: "Citizen", email: `newcit@${DOMAIN}`, password: "Str0ngPassw0rd!", location: { address: "12 Press Enclave Marg, Saket, New Delhi", pincode: "110017" } } })
      );
      expect(c.status).toBe(201);
      expect((await db.user.findUniqueOrThrow({ where: { email: `newcit@${DOMAIN}` } })).role).toBe("USER");
    });
  });

  // ------------------------------------------------------------------
  describe("address at sign-up", () => {
    const reg = (local: string, location: unknown) =>
      R.register.POST(req("/api/auth/register", { method: "POST", body: { name: "Addr Test", email: `${local}@${DOMAIN}`, password: "Str0ngPassw0rd!", location } }));
    const locOf = async (local: string) => {
      const u = await db.user.findUniqueOrThrow({ where: { email: `${local}@${DOMAIN}` }, include: { location: true } });
      return u.location;
    };

    it("an address and PIN code are required, with a clear message", async () => {
      const none = await R.register.POST(req("/api/auth/register", { method: "POST", body: { name: "No Addr", email: `noaddr@${DOMAIN}`, password: "Str0ngPassw0rd!" } }));
      expect(none.status).toBe(422);
      const badPin = await reg("badpin", { address: "12 Press Enclave Marg, Saket", pincode: "1234" });
      expect(badPin.status).toBe(422);
      expect((await json(badPin)).error.message).toBe("Enter a valid 6-digit PIN code.");
      expect(await db.user.count({ where: { email: { in: [`noaddr@${DOMAIN}`, `badpin@${DOMAIN}`] } } })).toBe(0);
    });

    it("a typed address is located from its PIN code and saved privately", async () => {
      const r = await reg("addrpin", { address: "12 Press Enclave Marg, Saket, New Delhi", pincode: "110017" });
      expect(r.status).toBe(201);
      expect((await json(r)).data.locationSaved).toBe(true);
      const loc = await locOf("addrpin");
      expect(loc).toMatchObject({ latitude: 28.52, longitude: 77.21, pincode: "110017", source: "SIGNUP", address: "12 Press Enclave Marg, Saket, New Delhi" });
    });

    it("'Use my current location' coordinates are rounded to ~1 km before storing", async () => {
      const r = await reg("addrgps", { address: "Flat 4, Sheikh Sarai, New Delhi", pincode: "110017", latitude: 28.531234, longitude: 77.219876 });
      expect(r.status).toBe(201);
      const loc = await locOf("addrgps");
      expect(loc).toMatchObject({ latitude: 28.53, longitude: 77.22, source: "GPS", address: "Flat 4, Sheikh Sarai, New Delhi" });
    });

    it("a location-service outage never blocks sign-up", async () => {
      geocoderDown = true;
      try {
        const r = await reg("addrdown", { address: "Somewhere Road, Delhi", pincode: "110001" });
        expect(r.status).toBe(201);
        expect((await json(r)).data.locationSaved).toBe(false);
        expect(await locOf("addrdown")).toBeNull();
      } finally {
        geocoderDown = false;
      }
    });
  });

  // ------------------------------------------------------------------
  describe("advocate onboarding", () => {
    it("requires sign-in", async () => {
      as(null);
      expect((await R.profile.GET()).status).toBe(401);
      expect((await R.profile.PUT(req("/x", { method: "PUT", body: PROFILE }))).status).toBe(401);
    });

    it("rejects an advertising bio and a bad enrolment number", async () => {
      as(lawyerU);
      const promo = await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, bio: "Best lawyer in Delhi, 100% success" } }));
      expect(promo.status).toBe(422);
      expect((await json(promo)).error.message).toMatch(/Bar Council rules/);
      const bad = await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, enrolmentNumber: "D/7001/2016" } }));
      expect(bad.status).toBe(422);
    });

    it("creating a profile makes the account a LAWYER and starts as DRAFT", async () => {
      as(lawyerU);
      const res = await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, enrolmentNumber: " d/7001/2015 " } }));
      expect(res.status).toBe(201);
      const p = (await json(res)).data.profile;
      profileId = p.id;
      expect(p).toMatchObject({ status: "DRAFT", enrolmentNumber: "D/7001/2015", listed: false });
      expect(p.missing).toEqual(expect.arrayContaining(["photo", "document: ENROLMENT_CERTIFICATE"]));
      expect((await db.user.findUniqueOrThrow({ where: { id: lawyerU } })).role).toBe("LAWYER");
    });

    it("one enrolment number, one account", async () => {
      as(other);
      const dup = await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, fullName: "Someone Else" } }));
      expect(dup.status).toBe(409);
      expect((await json(dup)).error.code).toBe("ENROLMENT_IN_USE");
      // The failed attempt did not turn the account into a lawyer.
      expect((await db.user.findUniqueOrThrow({ where: { id: other } })).role).toBe("USER");
    });

    it("an unverified advocate is invisible to others", async () => {
      as(citizen);
      expect((await R.lawyer.GET(req("/x"), P({ id: profileId }))).status).toBe(404);
    });

    it("cannot submit an incomplete profile", async () => {
      as(lawyerU);
      const r = await R.submit.POST();
      expect(r.status).toBe(422);
      expect((await json(r)).error.message).toMatch(/Complete these first/);
    });

    it("photo upload strips GPS metadata before storing", async () => {
      as(lawyerU);
      const res = await R.photo.POST(req("/x", { method: "POST", form: fileForm(jpegWithGps()) }));
      expect(res.status).toBe(200);
      const row = await db.lawyerProfile.findUniqueOrThrow({ where: { id: profileId } });
      const stored = readFileSync(path.join(state.storageDir, ...row.photoKey!.split("/")));
      expect(stored.toString("latin1")).not.toContain("GPS");
      expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    });

    it("rejects non-images as a photo and PDFs as the selfie", async () => {
      as(lawyerU);
      expect((await R.photo.POST(req("/x", { method: "POST", form: fileForm(PDF) }))).status).toBe(422);
      const selfie = await R.docs.POST(req("/x", { method: "POST", form: fileForm(PDF, { type: "SELFIE_WITH_ID" }) }));
      expect(selfie.status).toBe(422);
      const exe = await R.docs.POST(req("/x", { method: "POST", form: fileForm(Buffer.from("MZ executable"), { type: "PHOTO_ID" }) }));
      expect(exe.status).toBe(422);
      const badType = await R.docs.POST(req("/x", { method: "POST", form: fileForm(PDF, { type: "AADHAAR_FULL" }) }));
      expect(badType.status).toBe(422);
    });

    it("uploads the four documents; replacing one deletes the old file", async () => {
      as(lawyerU);
      for (const type of ["ENROLMENT_CERTIFICATE", "PRACTICE_CERTIFICATE", "PHOTO_ID"]) {
        const r = await R.docs.POST(req("/x", { method: "POST", form: fileForm(PDF, { type }) }));
        expect(r.status).toBe(200);
      }
      const s1 = await json(await R.docs.POST(req("/x", { method: "POST", form: fileForm(jpegWithGps(), { type: "SELFIE_WITH_ID" }) })));
      const firstKey = (await db.lawyerDocument.findUniqueOrThrow({ where: { id: s1.data.document.id } })).storageKey;
      await R.docs.POST(req("/x", { method: "POST", form: fileForm(jpegWithGps(), { type: "SELFIE_WITH_ID" }) }));
      const docs = await db.lawyerDocument.findMany({ where: { profileId } });
      expect(docs).toHaveLength(4);
      expect(existsSync(path.join(state.storageDir, ...firstKey.split("/")))).toBe(false);
      const docDir = path.join(state.storageDir, "lawyers", profileId, "docs");
      expect(readdirSync(docDir)).toHaveLength(4);
    });

    it("documents are readable by the owner and admins only", async () => {
      const d = await db.lawyerDocument.findFirstOrThrow({ where: { profileId, type: "ENROLMENT_CERTIFICATE" } });
      as(lawyerU);
      const own = await R.doc.GET(req("/x"), P({ docId: d.id }));
      expect(own.status).toBe(200);
      expect(own.headers.get("Content-Type")).toBe("application/pdf");
      expect(own.headers.get("Cache-Control")).toContain("no-store");
      expect(Buffer.from(await own.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
      as(citizen);
      expect((await R.doc.GET(req("/x"), P({ docId: d.id }))).status).toBe(404);
      as(admin);
      expect((await R.doc.GET(req("/x"), P({ docId: d.id }))).status).toBe(200);
      const logged = await db.auditLog.count({ where: { userId: admin, action: "LAWYER_DOCUMENT_VIEWED" } });
      expect(logged).toBeGreaterThan(0);
    });

    it("submits a complete profile and notifies admins", async () => {
      as(lawyerU);
      const r = await R.submit.POST();
      expect(r.status).toBe(200);
      expect((await json(r)).data.profile.status).toBe("SUBMITTED");
      expect(state.sent.some((m) => m.to === `admin@${DOMAIN}`)).toBe(true);
      expect((await R.submit.POST()).status).toBe(409); // already submitted
    });
  });

  // ------------------------------------------------------------------
  describe("admin verification", () => {
    it("is admins-only, checked against the database", async () => {
      as(citizen);
      expect((await R.adminList.GET(req("/x"))).status).toBe(403);
      expect((await R.review.POST(req("/x", { method: "POST", body: { decision: "APPROVE" } }), P({ id: profileId }))).status).toBe(403);
      as(lawyerU);
      expect((await R.adminOne.GET(req("/x"), P({ id: profileId }))).status).toBe(403);
    });

    it("lists the queue and shows checks, documents and history", async () => {
      as(admin);
      const list = await json(await R.adminList.GET(req("/api/admin/lawyers?status=SUBMITTED")));
      expect(list.data.profiles.map((p: any) => p.id)).toContain(profileId);
      const one = await json(await R.adminOne.GET(req("/x"), P({ id: profileId })));
      expect(one.data.profile.documents).toHaveLength(4);
      expect(one.data.checks.every((c: any) => c.ok)).toBe(true);
      expect(one.data.history.map((h: any) => h.action)).toContain("LAWYER_SUBMITTED");
    });

    it("rejecting needs a reason; approving lists the advocate and emails them", async () => {
      as(admin);
      expect((await R.review.POST(req("/x", { method: "POST", body: { decision: "REJECT" } }), P({ id: profileId }))).status).toBe(422);
      const ok = await R.review.POST(req("/x", { method: "POST", body: { decision: "APPROVE" } }), P({ id: profileId }));
      expect(ok.status).toBe(200);
      expect((await json(ok)).data.status).toBe("VERIFIED");
      expect(state.sent.some((m) => m.to === `lawyer@${DOMAIN}` && /verified/i.test(m.subject))).toBe(true);
      // A second approval is refused — the state machine holds.
      expect((await R.review.POST(req("/x", { method: "POST", body: { decision: "APPROVE" } }), P({ id: profileId }))).status).toBe(409);
    });

    it("changing an identity field sends a verified profile back to review", async () => {
      as(lawyerU);
      const r = await json(await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, fullName: "Test Advocate Renamed" } })));
      expect(r.data.sentBackForReview).toBe(true);
      expect(r.data.profile.status).toBe("SUBMITTED");
      // Non-identity edits do not.
      as(admin);
      await R.review.POST(req("/x", { method: "POST", body: { decision: "APPROVE" } }), P({ id: profileId }));
      as(lawyerU);
      const r2 = await json(await R.profile.PUT(req("/x", { method: "PUT", body: { ...PROFILE, fullName: "Test Advocate Renamed", bio: "Bail matters." } })));
      expect(r2.data.sentBackForReview).toBe(false);
      expect(r2.data.profile.status).toBe("VERIFIED");
    });
  });

  // ------------------------------------------------------------------
  describe("location and search", () => {
    let farId: string;

    beforeAll(async () => {
      // A second verified advocate 15 km away, and three that must never appear.
      const mk = async (local: string, data: Record<string, unknown>) => {
        const uid = await mkUser(local, "LAWYER");
        return (
          await db.lawyerProfile.create({
            data: {
              ...PROFILE,
              userId: uid,
              fullName: local,
              enrolmentNumber: `D/${Math.floor(Math.random() * 1e5)}/2015`,
              status: "VERIFIED",
              verifiedAt: new Date(),
              ...data,
            } as any,
          })
        ).id;
      };
      farId = await mk("far-advocate", { latitude: 28.6519, longitude: 77.1909, languages: ["en", "ta"], legalAidPanel: false, gender: "MALE" });
      await mk("draft-advocate", { status: "DRAFT", verifiedAt: null, latitude: 28.525, longitude: 77.207 });
      await mk("suspended-advocate", { status: "SUSPENDED", latitude: 28.525, longitude: 77.207 });
      await mk("expired-advocate", { verifiedAt: new Date(Date.now() - 400 * 86_400_000), latitude: 28.525, longitude: 77.207 });
    });

    it("without an address: lists everyone A to Z, but a distance filter needs an address", async () => {
      as(citizen);
      const all = await json(await R.search.GET(req("/api/lawyers")));
      expect(all.data.origin).toBeNull();
      const names = all.data.lawyers.map((l: any) => l.fullName);
      expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
      expect(all.data.lawyers.every((l: any) => l.distanceKm === null)).toBe(true);
      const r = await R.search.GET(req("/api/lawyers?radiusKm=10"));
      expect(r.status).toBe(409);
      expect((await json(r)).error.code).toBe("LOCATION_REQUIRED");
    });

    it("stores a GPS location rounded to ~1 km", async () => {
      as(citizen);
      const r = await R.location.PUT(req("/x", { method: "PUT", body: { source: "GPS", latitude: 28.524567, longitude: 77.206612 } }));
      expect(r.status).toBe(200);
      const loc = await db.userLocation.findUniqueOrThrow({ where: { userId: citizen } });
      expect([loc.latitude, loc.longitude]).toEqual([28.52, 77.21]);
      expect(loc.label).toBe("Saket, New Delhi");
      // The precise point was never sent to the geocoder either.
      const url = String((globalThis.fetch as any).mock.calls.at(-1)[0]);
      expect(url).toContain("lat=28.5200");
      expect(url).not.toContain("28.5245");
    });

    it("refuses locations outside India", async () => {
      as(citizen);
      expect((await R.location.PUT(req("/x", { method: "PUT", body: { source: "GPS", latitude: 51.5, longitude: -0.12 } }))).status).toBe(422);
    });

    // The DB may also hold other advocates (e.g. seeded demo profiles), so
    // results are checked against the advocates THIS test created.
    const ours = (list: any[]) => list.filter((l) => l.fullName === "Test Advocate Renamed" || l.fullName.endsWith("-advocate"));

    it("by default shows ALL distances, nearest first from the saved address", async () => {
      as(citizen);
      const all = await json(await R.search.GET(req("/api/lawyers")));
      expect(all.data.radiusKm).toBeNull();
      expect(all.data.origin).toMatchObject({ latitude: 28.52, longitude: 77.21 });
      expect(ours(all.data.lawyers).map((l: any) => l.fullName)).toEqual(["Test Advocate Renamed", "far-advocate"]);
      const d = all.data.lawyers.map((l: any) => l.distanceKm);
      expect(d).toEqual([...d].sort((a: number, b: number) => a - b));
      // Unlisted advocates never appear, at any distance.
      const names = all.data.lawyers.map((l: any) => l.fullName);
      for (const n of ["draft-advocate", "suspended-advocate", "expired-advocate"]) expect(names).not.toContain(n);
    });

    it("returns only verified, unexpired advocates, nearest first, within the radius", async () => {
      as(citizen);
      const near = await json(await R.search.GET(req("/api/lawyers?radiusKm=10")));
      expect(ours(near.data.lawyers).map((l: any) => l.fullName)).toEqual(["Test Advocate Renamed"]);
      const wide = await json(await R.search.GET(req("/api/lawyers?radiusKm=25")));
      const names = ours(wide.data.lawyers).map((l: any) => l.fullName);
      expect(names).toEqual(["Test Advocate Renamed", "far-advocate"]);
      // Global ordering holds across everyone returned.
      const d = wide.data.lawyers.map((l: any) => l.distanceKm);
      expect(d).toEqual([...d].sort((a: number, b: number) => a - b));
      expect(names).not.toContain("draft-advocate");
      expect(names).not.toContain("suspended-advocate");
      expect(names).not.toContain("expired-advocate");
          });

    it("filters by language, legal aid, gender and area", async () => {
      as(citizen);
      const ta = await json(await R.search.GET(req("/api/lawyers?radiusKm=25&language=ta")));
      expect(ours(ta.data.lawyers).map((l: any) => l.id)).toEqual([farId]);
      expect(ta.data.lawyers.every((l: any) => l.languages.includes("ta"))).toBe(true);
      const aid = await json(await R.search.GET(req("/api/lawyers?radiusKm=25&legalAid=1")));
      expect(ours(aid.data.lawyers).map((l: any) => l.id)).toEqual([profileId]);
      expect(aid.data.lawyers.every((l: any) => l.legalAidPanel || l.proBono)).toBe(true);
      const men = await json(await R.search.GET(req("/api/lawyers?radiusKm=25&gender=MALE")));
      expect(ours(men.data.lawyers).map((l: any) => l.id)).toEqual([farId]);
      const tax = await json(await R.search.GET(req("/api/lawyers?radiusKm=25&area=TAX")));
      expect(ours(tax.data.lawyers)).toHaveLength(0);
      expect(tax.data.lawyers.every((l: any) => l.practiceAreas.includes("TAX"))).toBe(true);
      expect((await R.search.GET(req("/api/lawyers?radiusKm=7"))).status).toBe(422);
    });

    it("public cards expose permitted details only", async () => {
      as(citizen);
      const card = ours((await json(await R.search.GET(req("/api/lawyers?radiusKm=10")))).data.lawyers)[0];
      for (const forbidden of ["userId", "email", "phone", "photoKey", "documents", "status", "rejectionReason", "aibeNumber", "gender"]) {
        expect(card).not.toHaveProperty(forbidden);
      }
      expect(card).toMatchObject({ enrolmentNumber: "D/7001/2015", legalAidPanel: true });
    });

    it("a listed advocate's photo is visible to citizens", async () => {
      as(citizen);
      const r = await R.lawyerPhoto.GET(req("/x"), P({ id: profileId }));
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe("image/jpeg");
    });
  });

  // ------------------------------------------------------------------
  describe("consultations, case sharing and messaging", () => {
    let consultationId: string;
    let caseId: string;
    let shareId: string;

    beforeAll(async () => {
      const c = await db.case.create({ data: { userId: citizen, title: "Custody — Ravi Kumar" } });
      caseId = c.id;
      await db.custodyTracker.create({
        data: {
          userId: citizen,
          caseId,
          personName: "Ravi Kumar",
          arrestDate: new Date(`${addDays(TODAY, -56)}T00:00:00Z`),
          firstRemandDate: new Date(`${addDays(TODAY, -55)}T00:00:00Z`),
          sections: ["303(2)"],
          priorConviction: "NO",
          otherPendingCases: "NO",
        },
      });
    });

    const body = (extra: Record<string, unknown> = {}) => ({
      lawyerId: profileId,
      category: "CRIMINAL",
      language: "hi",
      urgency: "URGENT",
      summary: "My brother was arrested 56 days ago under BNS 303(2). We need help with bail.",
      ...extra,
    });

    it("validates the target: not yourself, not someone else's case", async () => {
      as(lawyerU);
      expect((await R.cons.POST(req("/x", { method: "POST", body: body() }))).status).toBe(422);
      as(other);
      expect((await R.cons.POST(req("/x", { method: "POST", body: body({ caseId }) }))).status).toBe(404);
    });

    it("a citizen requests a consultation and shares a case; the advocate is emailed without details", async () => {
      as(citizen);
      const r = await R.cons.POST(req("/x", { method: "POST", body: body({ caseId }) }));
      expect(r.status).toBe(201);
      const c = (await json(r)).data.consultation;
      consultationId = c.id;
      shareId = c.shares[0].id;
      expect(c).toMatchObject({ status: "PENDING", party: "CITIZEN", actions: ["cancel"] });
      const mail = state.sent.find((m) => m.to === `lawyer@${DOMAIN}`)!;
      expect(mail.subject).toMatch(/Urgent/);
      expect(mail.text).not.toContain("303(2)");
      expect(mail.text).not.toContain("Ravi");
    });

    it("only one open request per advocate", async () => {
      as(citizen);
      const r = await R.cons.POST(req("/x", { method: "POST", body: body() }));
      expect(r.status).toBe(409);
      expect((await json(r)).error.code).toBe("ALREADY_OPEN");
    });

    it("outsiders see nothing", async () => {
      as(other);
      expect((await R.con.GET(req("/x"), P({ id: consultationId }))).status).toBe(404);
      expect((await R.msgs.GET(req("/x"), P({ id: consultationId }))).status).toBe(404);
      expect((await R.caseView.GET(req("/x"), P({ id: consultationId, caseId }))).status).toBe(404);
      expect((await R.con.PATCH(req("/x", { method: "PATCH", body: { action: "accept" } }), P({ id: consultationId }))).status).toBe(404);
    });

    it("no messages until accepted; the citizen cannot accept their own request", async () => {
      as(citizen);
      const m = await R.msgs.POST(req("/x", { method: "POST", body: { body: "Hello?" } }), P({ id: consultationId }));
      expect(m.status).toBe(409);
      expect((await R.con.PATCH(req("/x", { method: "PATCH", body: { action: "accept" } }), P({ id: consultationId }))).status).toBe(409);
    });

    it("the advocate reads the shared case — with the live Rights Clock — while deciding", async () => {
      as(lawyerU);
      const r = await R.caseView.GET(req("/x"), P({ id: consultationId, caseId }));
      expect(r.status).toBe(200);
      const d = (await json(r)).data;
      expect(d.trackers[0].personName).toBe("Ravi Kumar");
      expect(d.trackers[0].result.defaultBail.periods[0].rightArisesOn).toBe(addDays(TODAY, 5));
      expect(await db.auditLog.count({ where: { userId: lawyerU, action: "CASE_SHARE_VIEWED" } })).toBeGreaterThan(0);
    });

    it("the Client Desk lists the client's custody deadline", async () => {
      as(lawyerU);
      const d = (await json(await R.deadlines.GET())).data;
      const item = d.deadlines.find((x: any) => x.consultationId === consultationId);
      expect(item).toMatchObject({ personName: "Ravi Kumar", date: addDays(TODAY, 5), daysUntil: 5, urgent: true, client: "citizen P." });
    });

    it("accepting twice at once applies exactly once", async () => {
      as(lawyerU);
      const [a, b] = await Promise.all([
        R.con.PATCH(req("/x", { method: "PATCH", body: { action: "accept" } }), P({ id: consultationId })),
        R.con.PATCH(req("/x", { method: "PATCH", body: { action: "accept" } }), P({ id: consultationId })),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await db.consultationRequest.findUniqueOrThrow({ where: { id: consultationId } })).status).toBe("ACCEPTED");
      expect(state.sent.some((m) => m.to === `citizen@${DOMAIN}` && /accepted/.test(m.subject))).toBe(true);
    });

    it("both sides message; reading marks messages read and clears unread", async () => {
      as(citizen);
      expect((await R.msgs.POST(req("/x", { method: "POST", body: { body: "Thank you. The remand order is dated." } }), P({ id: consultationId }))).status).toBe(201);
      as(lawyerU);
      const list = await json(await R.cons.GET());
      expect(list.data.asLawyer.find((c: any) => c.id === consultationId).unread).toBe(1);
      const msgs = await json(await R.msgs.GET(req("/x"), P({ id: consultationId })));
      expect(msgs.data.messages).toHaveLength(1);
      expect(msgs.data.messages[0].mine).toBe(false);
      await R.msgs.POST(req("/x", { method: "POST", body: { body: "I will file the default bail application." } }), P({ id: consultationId }));
      const list2 = await json(await R.cons.GET());
      expect(list2.data.asLawyer.find((c: any) => c.id === consultationId).unread).toBe(0);
      as(citizen);
      const seen = await json(await R.msgs.GET(req("/x"), P({ id: consultationId })));
      expect(seen.data.messages.map((m: any) => m.mine)).toEqual([true, false]);
      const empty = await R.msgs.POST(req("/x", { method: "POST", body: { body: "   " } }), P({ id: consultationId }));
      expect(empty.status).toBe(422);
    });

    it("revoking a share cuts the advocate off immediately; re-sharing restores it", async () => {
      as(lawyerU);
      expect((await R.share.DELETE(req("/x", { method: "DELETE" }), P({ id: consultationId, shareId }))).status).toBe(403);
      as(citizen);
      expect((await R.share.DELETE(req("/x", { method: "DELETE" }), P({ id: consultationId, shareId }))).status).toBe(200);
      as(lawyerU);
      expect((await R.caseView.GET(req("/x"), P({ id: consultationId, caseId }))).status).toBe(404);
      expect((await json(await R.deadlines.GET())).data.deadlines).toHaveLength(0);
      as(citizen);
      expect((await R.shares.POST(req("/x", { method: "POST", body: { caseId } }), P({ id: consultationId }))).status).toBe(201);
      as(lawyerU);
      expect((await R.caseView.GET(req("/x"), P({ id: consultationId, caseId }))).status).toBe(200);
    });

    it("closing ends messaging and case access", async () => {
      as(citizen);
      expect((await R.con.PATCH(req("/x", { method: "PATCH", body: { action: "close" } }), P({ id: consultationId }))).status).toBe(200);
      as(lawyerU);
      expect((await R.caseView.GET(req("/x"), P({ id: consultationId, caseId }))).status).toBe(404);
      expect((await R.msgs.POST(req("/x", { method: "POST", body: { body: "One more thing" } }), P({ id: consultationId }))).status).toBe(409);
      // History stays readable.
      expect((await json(await R.msgs.GET(req("/x"), P({ id: consultationId })))).data.messages).toHaveLength(2);
    });

    it("a citizen may have at most 3 requests waiting", async () => {
      as(other);
      await R.location.PUT(req("/x", { method: "PUT", body: { source: "GPS", latitude: 28.52, longitude: 77.21 } }));
      const extra = [];
      for (let i = 0; i < 3; i++) {
        const uid = await mkUser(`cap${i}`, "LAWYER");
        extra.push(
          (
            await db.lawyerProfile.create({
              data: { ...PROFILE, userId: uid, fullName: `Cap ${i}`, enrolmentNumber: `D/88${i}/2015`, status: "VERIFIED", verifiedAt: new Date() } as any,
            })
          ).id
        );
      }
      for (const id of extra) expect((await R.cons.POST(req("/x", { method: "POST", body: body({ lawyerId: id }) }))).status).toBe(201);
      const fourth = await R.cons.POST(req("/x", { method: "POST", body: body({ lawyerId: profileId }) }));
      expect(fourth.status).toBe(409);
      expect((await json(fourth)).error.code).toBe("TOO_MANY_PENDING");
    });
  });

  // ------------------------------------------------------------------
  describe("suspension and deletion", () => {
    it("suspending hides the advocate and declines their pending requests", async () => {
      as(other);
      const pend = await db.consultationRequest.findFirstOrThrow({ where: { citizenId: other, status: "PENDING" }, include: { lawyer: true } });
      as(admin);
      const r = await R.review.POST(req("/x", { method: "POST", body: { decision: "SUSPEND", reason: "Confirmed report" } }), P({ id: pend.lawyerProfileId }));
      expect(r.status).toBe(200);
      expect((await db.consultationRequest.findUniqueOrThrow({ where: { id: pend.id } })).status).toBe("DECLINED");
      as(citizen);
      expect((await R.lawyer.GET(req("/x"), P({ id: pend.lawyerProfileId }))).status).toBe(404);
    });

    it("deleting an advocate account removes the profile, documents and their rows", async () => {
      const before = await db.lawyerDocument.count({ where: { profileId } });
      expect(before).toBe(4);
      await db.user.delete({ where: { id: lawyerU } });
      expect(await db.lawyerProfile.findUnique({ where: { id: profileId } })).toBeNull();
      expect(await db.lawyerDocument.count({ where: { profileId } })).toBe(0);
      expect(await db.consultationRequest.count({ where: { lawyerProfileId: profileId } })).toBe(0);
    });
  });
});
