import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { boundingBox, distanceKm, formatDistance, roundForPrivacy } from "@/lib/lawyers/geo";
import { availableActions, canMessage, lawyerCanReadShares, nextStatus } from "@/lib/lawyers/consultation-rules";
import { checkUpload, sniffType, stripMetadata } from "@/lib/lawyers/files";
import { assertSafeKey, LocalDiskStorageProvider } from "@/lib/storage/storage";
import { GeocodeError, geocodePincode, geocodeQuery, labelFor, resetGeocoderState, reverseGeocode } from "@/lib/lawyers/geocode";
import { buildNotificationEmail } from "@/lib/email/templates";

// ---------------------------------------------------------- geo

describe("geography", () => {
  it("computes great-circle distance", () => {
    // Connaught Place → India Gate ≈ 2.3 km; Delhi → Mumbai ≈ 1,150 km.
    expect(distanceKm(28.6315, 77.2167, 28.6129, 77.2295)).toBeCloseTo(2.4, 0);
    expect(distanceKm(28.6139, 77.209, 19.076, 72.8777)).toBeGreaterThan(1100);
    expect(distanceKm(28.6139, 77.209, 19.076, 72.8777)).toBeLessThan(1200);
    expect(distanceKm(28.5, 77.2, 28.5, 77.2)).toBe(0);
  });

  it("the bounding box contains every point within the radius", () => {
    const [lat, lng, r] = [28.5245, 77.2066, 10];
    const box = boundingBox(lat, lng, r);
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const pLat = lat + ((r * 0.999) / 110.574) * Math.cos(rad);
      const pLng = lng + ((r * 0.999) / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad);
      expect(pLat).toBeGreaterThanOrEqual(box.minLat);
      expect(pLat).toBeLessThanOrEqual(box.maxLat);
      expect(pLng).toBeGreaterThanOrEqual(box.minLng);
      expect(pLng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it("rounds a citizen's location to ~1 km", () => {
    expect(roundForPrivacy(28.524567)).toBe(28.52);
    expect(roundForPrivacy(77.20661)).toBe(77.21);
    // Rounding never moves a point more than ~0.8 km in Delhi.
    expect(distanceKm(28.524567, 77.20661, 28.52, 77.21)).toBeLessThan(0.8);
  });

  it("formats distances", () => {
    expect(formatDistance(0.35)).toBe("400 m");
    expect(formatDistance(2.34)).toBe("2.3 km");
    expect(formatDistance(23.6)).toBe("24 km");
  });
});

// ---------------------------------------------------------- state machine

describe("consultation state machine", () => {
  it.each([
    ["PENDING", "accept", "LAWYER", "ACCEPTED"],
    ["PENDING", "decline", "LAWYER", "DECLINED"],
    ["PENDING", "cancel", "CITIZEN", "CANCELLED"],
    ["ACCEPTED", "close", "CITIZEN", "CLOSED"],
    ["ACCEPTED", "close", "LAWYER", "CLOSED"],
  ] as const)("%s --%s(%s)--> %s", (from, action, party, to) => {
    expect(nextStatus(from, action, party)).toEqual({ ok: true, status: to });
  });

  it.each([
    ["PENDING", "accept", "CITIZEN"], // a citizen cannot accept their own request
    ["PENDING", "cancel", "LAWYER"],
    ["ACCEPTED", "accept", "LAWYER"],
    ["ACCEPTED", "cancel", "CITIZEN"],
    ["DECLINED", "accept", "LAWYER"],
    ["CLOSED", "close", "LAWYER"],
    ["CANCELLED", "accept", "LAWYER"],
  ] as const)("refuses %s --%s(%s)", (from, action, party) => {
    expect(nextStatus(from, action, party).ok).toBe(false);
  });

  it("messaging and case access follow the status", () => {
    expect(canMessage("PENDING")).toBe(false);
    expect(canMessage("ACCEPTED")).toBe(true);
    expect(canMessage("CLOSED")).toBe(false);
    expect(lawyerCanReadShares("PENDING")).toBe(true);
    expect(lawyerCanReadShares("CLOSED")).toBe(false);
    expect(lawyerCanReadShares("DECLINED")).toBe(false);
    expect(availableActions("PENDING", "LAWYER")).toEqual(["accept", "decline"]);
    expect(availableActions("PENDING", "CITIZEN")).toEqual(["cancel"]);
    expect(availableActions("CLOSED", "CITIZEN")).toEqual([]);
  });
});

// ---------------------------------------------------------- files

/** A minimal JPEG: SOI, APP0 (JFIF), APP1 (EXIF with "GPS" bytes), SOS + data, EOI. */
function jpegWithExif(): Buffer {
  const seg = (marker: number, payload: Buffer) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, Buffer.from("Exif\0\0GPSLatitude=28.5245;GPSLongitude=77.2066", "latin1")),
    seg(0xfe, Buffer.from("secret comment", "latin1")),
    seg(0xdb, Buffer.alloc(65, 1)), // quantisation table (kept)
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xaa, 0xbb, 0xff, 0xd9]),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngWithText(): Buffer {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", Buffer.from("Location\0Home, Saket", "latin1")),
    pngChunk("eXIf", Buffer.from("MM\0*GPS", "latin1")),
    pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1])),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function webpWithExif(): Buffer {
  const chunk = (cc: string, data: Buffer) => {
    const h = Buffer.alloc(8);
    h.write(cc, 0, "ascii");
    h.writeUInt32LE(data.length, 4);
    return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF + XMP flags
  const body = Buffer.concat([chunk("VP8X", vp8x), chunk("VP8 ", Buffer.alloc(10, 7)), chunk("EXIF", Buffer.from("GPS-28.5")), chunk("XMP ", Buffer.from("<xmp/>"))]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

describe("upload checks and metadata stripping", () => {
  it("detects type from bytes, not names", () => {
    expect(sniffType(jpegWithExif())).toBe("image/jpeg");
    expect(sniffType(pngWithText())).toBe("image/png");
    expect(sniffType(webpWithExif())).toBe("image/webp");
    expect(sniffType(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffType(Buffer.from("MZ\x90\x00 executable"))).toBeNull();
  });

  it("removes EXIF/GPS and comments from JPEG, keeps image data", () => {
    const out = stripMetadata(jpegWithExif(), "image/jpeg");
    const s = out.toString("latin1");
    expect(s).not.toContain("GPS");
    expect(s).not.toContain("secret comment");
    expect(s).toContain("JFIF");
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });

  it("removes text and EXIF chunks from PNG, keeps a valid chunk sequence", () => {
    const out = stripMetadata(pngWithText(), "image/png");
    const s = out.toString("latin1");
    expect(s).not.toContain("Saket");
    expect(s).not.toContain("GPS");
    expect(s).toContain("IHDR");
    expect(s).toContain("IDAT");
    expect(s.endsWith("IEND\xaeB`\x82")).toBe(true);
  });

  it("removes EXIF/XMP from WebP, clears the VP8X flags and fixes the RIFF size", () => {
    const out = stripMetadata(webpWithExif(), "image/webp");
    expect(out.toString("latin1")).not.toContain("GPS");
    expect(out.toString("latin1")).not.toContain("<xmp/>");
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    const vp8xFlags = out[12 + 8];
    expect(vp8xFlags & 0x0c).toBe(0);
  });

  it("checkUpload enforces size, type and photo-only rules", () => {
    expect(checkUpload(Buffer.alloc(0), { maxBytes: 100, imagesOnly: false })).toMatchObject({ ok: false, message: "The file is empty." });
    expect(checkUpload(Buffer.alloc(200, 1), { maxBytes: 100, imagesOnly: false })).toMatchObject({ ok: false });
    expect(checkUpload(Buffer.from("%PDF-1.4 x"), { maxBytes: 1e6, imagesOnly: true })).toMatchObject({ ok: false, message: /must be a photo/ });
    expect(checkUpload(Buffer.from("%PDF-1.4 x"), { maxBytes: 1e6, imagesOnly: false })).toMatchObject({ ok: true, type: "application/pdf" });
    expect(checkUpload(Buffer.from("GIF89a....."), { maxBytes: 1e6, imagesOnly: false })).toMatchObject({ ok: false });
    const truncated = jpegWithExif().subarray(0, 25);
    expect(checkUpload(truncated, { maxBytes: 1e6, imagesOnly: true })).toMatchObject({ ok: false, message: /damaged/ });
  });
});

// ---------------------------------------------------------- storage

describe("private local storage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ls-store-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each(["../etc/passwd", "a/../../b", "/abs/path", "a\\b", "C:/x", "a//b", "./a", "", "a/\0/b"])("rejects unsafe key %j", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });

  it("writes, reads, replaces and deletes inside the root only", async () => {
    const s = new LocalDiskStorageProvider(dir);
    await s.upload("lawyers/p1/docs/a.pdf", Buffer.from("one"));
    expect((await s.read("lawyers/p1/docs/a.pdf"))!.toString()).toBe("one");
    await s.upload("lawyers/p1/docs/a.pdf", Buffer.from("two"));
    expect((await s.read("lawyers/p1/docs/a.pdf"))!.toString()).toBe("two");
    // No temp files left behind by the atomic write.
    expect(readdirSync(path.join(dir, "lawyers", "p1", "docs"))).toEqual(["a.pdf"]);
    await s.delete("lawyers/p1/docs/a.pdf");
    expect(await s.read("lawyers/p1/docs/a.pdf")).toBeNull();
    await expect(s.read("../outside.txt")).rejects.toThrow(/Invalid storage key/);
  });
});

// ---------------------------------------------------------- geocoder

describe("geocoder (Nominatim)", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  beforeEach(() => resetGeocoderState());
  afterEach(() => vi.unstubAllGlobals());

  it("looks up a PIN code, sends an identifying User-Agent, and caches", async () => {
    const fetchMock = vi.fn(async () =>
      ok([{ lat: "28.5245", lon: "77.2066", address: { suburb: "Saket", city: "New Delhi", postcode: "110017" } }])
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = await geocodePincode("110017");
    expect(p).toMatchObject({ latitude: 28.5245, longitude: 77.2066, label: "Saket, New Delhi", pincode: "110017" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("postalcode=110017");
    expect(url).toContain("countrycodes=in");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/LegalSetu/);
    await geocodePincode("110017");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports not-found and unavailable distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok([])));
    await expect(geocodePincode("999999")).rejects.toMatchObject({ kind: "NOT_FOUND" });
    resetGeocoderState();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(geocodeQuery("Saket")).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    resetGeocoderState();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network"))));
    await expect(geocodeQuery("Saket")).rejects.toBeInstanceOf(GeocodeError);
  });

  it("reverse geocoding never fails — it falls back to a neutral label", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await reverseGeocode(28.52, 77.21)).toBe("Current location");
  });

  it("keeps calls at least ~1 s apart (usage policy)", async () => {
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(Date.now());
        return ok([{ lat: "1", lon: "2", address: { city: "X" } }]);
      })
    );
    await Promise.all([geocodeQuery("a"), geocodeQuery("b")]);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
  }, 10_000);

  it("builds readable labels", () => {
    expect(labelFor({ lat: "0", lon: "0", address: { neighbourhood: "Lajpat Nagar II", city: "New Delhi" } })).toBe("Lajpat Nagar II, New Delhi");
    expect(labelFor({ lat: "0", lon: "0", address: { city: "Delhi" } })).toBe("Delhi");
    expect(labelFor({ lat: "0", lon: "0", display_name: "Somewhere, Some district, India" })).toBe("Somewhere, Some district");
  });
});

// ---------------------------------------------------------- notification email

describe("notification email", () => {
  it("escapes everything and carries no case detail beyond what is passed", () => {
    const m = buildNotificationEmail({
      name: "Asha <img src=x>",
      subject: "s",
      heading: "New request",
      body: "Line <b>one</b>\n\nLine two",
      ctaLabel: "Open",
      ctaUrl: "https://x.example/a?b=1&c=2",
    });
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).not.toContain("<b>one</b>");
    expect(m.html).toContain("&amp;c=2");
    expect(m.text).toContain("Line two");
  });
});
