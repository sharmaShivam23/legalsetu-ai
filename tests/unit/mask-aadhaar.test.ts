import { describe, it, expect, vi } from "vitest";

// The module imports the browser OCR loader; only the pure function is tested.
vi.mock("@/lib/ocr/ocr", () => ({ loadTesseract: vi.fn(), pdfToPageBlobs: vi.fn(), TESSERACT_CDN: {} }));

import { findAadhaarBoxes, type OcrWord } from "@/components/lawyers/mask-aadhaar";

const w = (text: string, x0: number, y0 = 100, width = 80): OcrWord => ({
  text,
  bbox: { x0, y0, x1: x0 + width, y1: y0 + 30 },
});

describe("findAadhaarBoxes", () => {
  it("masks the first two groups of a 4-4-4 Aadhaar and keeps the last", () => {
    const boxes = findAadhaarBoxes([w("Name", 0), w("2345", 100), w("6789", 200), w("0123", 300)]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x0).toBe(100);
    expect(boxes[1].x0).toBe(200);
  });

  it("masks the left 8/12 of a single 12-digit token", () => {
    const boxes = findAadhaarBoxes([w("234567890123", 100, 100, 120)]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x0).toBe(100);
    expect(boxes[0].x1).toBeCloseTo(100 + 120 * (8 / 12));
  });

  it("masks the first 12 digits of a 16-digit Virtual ID", () => {
    const boxes = findAadhaarBoxes([w("2345", 0), w("6789", 100), w("0123", 200), w("4567", 300)]);
    expect(boxes).toHaveLength(3);
  });

  it("ignores phone numbers, PIN codes, years and numbers starting 0/1", () => {
    expect(findAadhaarBoxes([w("9876543210", 0), w("110001", 100), w("2026", 200)])).toEqual([]);
    expect(findAadhaarBoxes([w("1234", 0), w("5678", 100), w("9012", 200)])).toEqual([]);
  });

  it("does not join groups that sit on different lines", () => {
    expect(findAadhaarBoxes([w("2345", 0, 100), w("6789", 100, 400), w("0123", 200, 700)])).toEqual([]);
  });
});
