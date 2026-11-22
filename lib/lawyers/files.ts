// ==========================================================
// LegalSetu — upload checks and metadata stripping (server)
// ----------------------------------------------------------
// 1. The type is decided from the file's bytes, never from the
//    browser-supplied Content-Type or file name.
// 2. Image metadata is removed before anything is stored. Phone
//    photos embed EXIF GPS coordinates — a "profile photo" would
//    otherwise publish where it was taken (often the lawyer's home).
// ==========================================================

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export function sniffType(buf: Buffer): SniffedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export const EXTENSION: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export class InvalidImageError extends Error {
  constructor(message = "The image file is damaged or not a supported format.") {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** JPEG: drop APP1 (EXIF/XMP), APP13 (IPTC) and comments; keep JFIF, ICC colour, Adobe. */
function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new InvalidImageError();
    // Fill bytes before a marker are legal.
    while (buf[i + 1] === 0xff) i++;
    const marker = buf[i + 1];
    if (marker === undefined) throw new InvalidImageError();
    // Start of scan: the rest is compressed image data — copy as is.
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if (i + 4 > buf.length) throw new InvalidImageError();
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new InvalidImageError();
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new InvalidImageError();
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

/** PNG: drop EXIF and text chunks; everything else is copied with its CRC. */
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i < buf.length) {
    if (i + 12 > buf.length) throw new InvalidImageError();
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new InvalidImageError();
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new InvalidImageError();
  return Buffer.concat(out);
}

/** WebP: drop EXIF and XMP chunks, clear their VP8X flags, fix the RIFF size. */
function stripWebp(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i < buf.length) {
    if (i + 8 > buf.length) throw new InvalidImageError();
    const fourcc = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > buf.length) throw new InvalidImageError();
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (fourcc === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04);
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

/** Returns the image without metadata. PDFs are returned unchanged. */
export function stripMetadata(buf: Buffer, type: SniffedType): Buffer {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(buf);
    case "image/png":
      return stripPng(buf);
    case "image/webp":
      return stripWebp(buf);
    default:
      return buf;
  }
}

export interface UploadRules {
  maxBytes: number;
  imagesOnly: boolean;
}

export type CheckedUpload = { ok: true; type: SniffedType; data: Buffer } | { ok: false; message: string };

/** Size, real type and metadata in one step — the only way an upload reaches storage. */
export function checkUpload(buf: Buffer, rules: UploadRules): CheckedUpload {
  if (buf.length === 0) return { ok: false, message: "The file is empty." };
  if (buf.length > rules.maxBytes) {
    return { ok: false, message: `The file is too large (max ${Math.round(rules.maxBytes / 1024 / 1024)} MB).` };
  }
  const type = sniffType(buf);
  if (!type) return { ok: false, message: "Upload a JPG, PNG, WebP image or a PDF." };
  if (rules.imagesOnly && type === "application/pdf") return { ok: false, message: "This must be a photo (JPG, PNG or WebP)." };
  try {
    return { ok: true, type, data: stripMetadata(buf, type) };
  } catch (err) {
    if (err instanceof InvalidImageError) return { ok: false, message: err.message };
    throw err;
  }
}
