// Automatic Aadhaar masking, done in the BROWSER before anything is uploaded,
// so a full Aadhaar number never leaves the user's device.
//
// The image is read with Tesseract (English digits only), every 12-digit
// Aadhaar number (and 16-digit Virtual ID) is located, and the FIRST 8 digits
// (12 for a VID) are covered with a black box — the same "XXXX XXXX 1234"
// form UIDAI's own masked Aadhaar uses. The last 4 digits stay visible.

import { loadTesseract, pdfToPageBlobs, TESSERACT_CDN } from "@/lib/ocr/ocr";

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function sameLine(a: OcrWord, b: OcrWord): boolean {
  const h = Math.max(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
  const ca = (a.bbox.y0 + a.bbox.y1) / 2;
  const cb = (b.bbox.y0 + b.bbox.y1) / 2;
  return Math.abs(ca - cb) < h * 0.7;
}

/** The part of a word's box covering its first `keep`/`total` digits. */
function leftPart(w: OcrWord, fraction: number): Box {
  const width = w.bbox.x1 - w.bbox.x0;
  return { ...w.bbox, x1: w.bbox.x0 + width * fraction };
}

/**
 * Pure: given OCR words in reading order, returns the boxes to black out.
 * Handles an Aadhaar printed as "1234 5678 9012", as one token
 * "123456789012", and the 16-digit Virtual ID in either form.
 */
export function findAadhaarBoxes(words: OcrWord[]): Box[] {
  const boxes: Box[] = [];
  const used = new Set<number>();

  for (let i = 0; i < words.length; i++) {
    if (used.has(i)) continue;
    const d = digitsOnly(words[i].text);

    // One token: 12 digits (Aadhaar) or 16 digits (VID).
    if (/^\d+$/.test(words[i].text.replace(/\s/g, "")) && (d.length === 12 || d.length === 16) && /^[2-9]/.test(d)) {
      boxes.push(leftPart(words[i], d.length === 12 ? 8 / 12 : 12 / 16));
      used.add(i);
      continue;
    }

    // Groups of four: 4-4-4 (Aadhaar) or 4-4-4-4 (VID).
    if (d.length === 4 && /^[2-9]/.test(d) && words[i].text.trim().length <= 5) {
      const group = [i];
      for (let j = i + 1; j < words.length && group.length < 4; j++) {
        const dj = digitsOnly(words[j].text);
        if (dj.length === 4 && sameLine(words[group[group.length - 1]], words[j])) group.push(j);
        else break;
      }
      if (group.length >= 3) {
        const maskCount = group.length === 3 ? 2 : 3;
        for (let k = 0; k < maskCount; k++) {
          boxes.push(words[group[k]].bbox);
        }
        group.forEach((k) => used.add(k));
      }
    }
  }
  return boxes;
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function maskCanvas(canvas: HTMLCanvasElement, worker: any): Promise<boolean> {
  const { data } = await worker.recognize(canvas);
  const words: OcrWord[] = (data?.words ?? [])
    .filter((w: any) => w?.text && w?.bbox)
    .map((w: any) => ({ text: String(w.text), bbox: w.bbox }));
  const boxes = findAadhaarBoxes(words);
  if (boxes.length === 0) return false;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  for (const b of boxes) {
    const pad = Math.max(4, (b.y1 - b.y0) * 0.25);
    ctx.fillRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2);
  }
  return true;
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), "image/jpeg", 0.88)
  );

/** A multi-page PDF holding a full Aadhaar: the user must supply a masked copy. */
export class AadhaarPdfError extends Error {}

export interface MaskResult {
  file: Blob;
  /** True when an Aadhaar number was found and covered. */
  masked: boolean;
}

/**
 * Looks for an Aadhaar number in an image or PDF and masks it.
 *  - Images: returns a new JPEG with the digits blacked out (or the input
 *    unchanged when none were found).
 *  - Single-page PDFs: same, returned as a JPEG.
 *  - Multi-page PDFs: cannot be edited in the browser, so if an Aadhaar is
 *    found this throws and asks for a masked copy instead.
 * Throws only for that case; if the OCR engine itself cannot load, the
 * caller decides what to do (see the profile form).
 */
export async function maskAadhaar(input: Blob, original: File): Promise<MaskResult> {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker("eng", 1, { ...TESSERACT_CDN });
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789 ", tessedit_pageseg_mode: "11" });

    if (original.type === "application/pdf") {
      const { blobs, totalPages } = await pdfToPageBlobs(original, 4);
      let found = false;
      const canvases: HTMLCanvasElement[] = [];
      for (const page of blobs) {
        const canvas = await blobToCanvas(page);
        if (await maskCanvas(canvas, worker)) found = true;
        canvases.push(canvas);
      }
      if (!found) return { file: input, masked: false };
      if (totalPages > 1) {
        throw new AadhaarPdfError(
          "This PDF contains a full Aadhaar number. Please upload a masked Aadhaar (download it from the UIDAI site) or a single-page image instead."
        );
      }
      return { file: await toJpeg(canvases[0]), masked: true };
    }

    const canvas = await blobToCanvas(input);
    const found = await maskCanvas(canvas, worker);
    return found ? { file: await toJpeg(canvas), masked: true } : { file: input, masked: false };
  } finally {
    await worker.terminate();
  }
}
