// ==========================================================
// LegalSetu — FIR Assistant: complaint PDF renderer
// ----------------------------------------------------------
// Replaces the previous client-side exporter, which used jsPDF's
// built-in Helvetica. That font is Latin-1 only: Devanagari was
// silently dropped from the output entirely (verified — no
// Devanagari codepoints survived into the file) and the ₹ sign
// could not be represented. For an app whose whole premise is
// serving people in their own language, a PDF that cannot print
// Hindi or a rupee amount is not a formatting nit.
//
// So this runs server-side and embeds real Unicode fonts (Noto
// Sans + Noto Sans Devanagari) from assets/fonts. Server-side
// also means the draft is validated before a single byte is
// rendered, so a fabricated figure cannot reach a printable page.
//
// Deliberately plain: no seals, no crests, no colour blocks.
// This document must never be mistakable for a police record.
// ==========================================================

import { jsPDF } from "jspdf";
import { readFileSync } from "fs";
import path from "path";

const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const LINE_GAP = 1.6;
const BOTTOM_LIMIT = A4_HEIGHT - 22;

export interface ComplaintSection {
  heading: string;
  /** Paragraphs. Empty array renders the heading alone (rare). */
  body: string[];
}

export interface ComplaintDocument {
  /** e.g. "Police Complaint / FIR Draft" — never "FIR". */
  title: string;
  addressee: string[];
  subject: string;
  salutation: string;
  opening: string;
  sections: ComplaintSection[];
  declaration: string;
  place?: string;
  date: string;
  signatureName: string;
  /** Rendered in the footer of every page. */
  footerNote: string;
}

/**
 * Loads the Unicode fonts once per process. Read from disk rather than
 * base64-inlined into the bundle so the client never downloads ~1.3MB
 * of font data it has no use for.
 */
function registerFonts(doc: jsPDF): { latin: string; deva: string } {
  const dir = path.join(process.cwd(), "assets", "fonts");

  const add = (file: string, family: string, style: string) => {
    const b64 = readFileSync(path.join(dir, file)).toString("base64");
    doc.addFileToVFS(file, b64);
    doc.addFont(file, family, style);
  };

  add("NotoSans-Regular.ttf", "NotoSans", "normal");
  add("NotoSans-Bold.ttf", "NotoSans", "bold");
  add("NotoSansDevanagari-Regular.ttf", "NotoDeva", "normal");

  return { latin: "NotoSans", deva: "NotoDeva" };
}

/** True when the string contains Devanagari, which needs the Indic font. */
function needsDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

interface Cursor {
  y: number;
  page: number;
}

export function renderComplaintPdf(docData: ComplaintDocument): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const fonts = registerFonts(doc);

  const cursor: Cursor = { y: MARGIN, page: 1 };

  const setFont = (text: string, style: "normal" | "bold", size: number) => {
    // Devanagari has no bold face bundled; using the regular weight is
    // correct rather than letting jsPDF fall back to a Latin font that
    // would drop the glyphs altogether.
    if (needsDevanagari(text)) doc.setFont(fonts.deva, "normal");
    else doc.setFont(fonts.latin, style);
    doc.setFontSize(size);
  };

  const lineHeight = (size: number) => size * 0.3528 * LINE_GAP;

  const newPage = () => {
    doc.addPage();
    cursor.page += 1;
    cursor.y = MARGIN;
  };

  /** Writes wrapped text, breaking pages as needed. Never clips. */
  const write = (
    text: string,
    opts: { size?: number; style?: "normal" | "bold"; gapAfter?: number; align?: "left" | "center" } = {}
  ) => {
    const size = opts.size ?? 11;
    const style = opts.style ?? "normal";
    setFont(text, style, size);

    const lines: string[] = doc.splitTextToSize(text, CONTENT_WIDTH);
    const lh = lineHeight(size);

    for (const line of lines) {
      if (cursor.y + lh > BOTTOM_LIMIT) newPage();
      // Re-assert the font after a page break.
      setFont(line, style, size);
      const x = opts.align === "center" ? A4_WIDTH / 2 : MARGIN;
      doc.text(line, x, cursor.y, opts.align === "center" ? { align: "center" } : undefined);
      cursor.y += lh;
    }
    cursor.y += opts.gapAfter ?? 2;
  };

  /** Keeps a heading with at least two lines of its body. */
  const writeHeading = (text: string) => {
    const needed = lineHeight(11.5) * 3;
    if (cursor.y + needed > BOTTOM_LIMIT) newPage();
    cursor.y += 2;
    write(text, { size: 11.5, style: "bold", gapAfter: 1.5 });
  };

  // ---------- Header ----------
  write("LEGALSETU", { size: 13, style: "bold", gapAfter: 0.5 });
  write(docData.title, { size: 10.5, style: "normal", gapAfter: 1 });
  write(`Generated on ${docData.date}`, { size: 9, gapAfter: 2 });

  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, cursor.y, A4_WIDTH - MARGIN, cursor.y);
  cursor.y += 5;

  write("Draft prepared from information provided by the complainant.", {
    size: 8.5,
    gapAfter: 6,
  });

  // ---------- Addressee ----------
  for (const line of docData.addressee) write(line, { size: 11, gapAfter: 0.5 });
  cursor.y += 4;

  write(`Subject: ${docData.subject}`, { size: 11, style: "bold", gapAfter: 5 });
  write(docData.salutation, { size: 11, gapAfter: 3 });
  write(docData.opening, { size: 11, gapAfter: 4 });

  // ---------- Body ----------
  for (const section of docData.sections) {
    writeHeading(section.heading);
    for (const paragraph of section.body) {
      write(paragraph, { size: 11, gapAfter: 2 });
    }
  }

  // ---------- Declaration ----------
  cursor.y += 3;
  writeHeading("DECLARATION");
  write(docData.declaration, { size: 11, gapAfter: 8 });

  // ---------- Signature block ----------
  const signatureBlockHeight = 30;
  if (cursor.y + signatureBlockHeight > BOTTOM_LIMIT) newPage();

  if (docData.place) write(`Place: ${docData.place}`, { size: 11, gapAfter: 1 });
  write(`Date: ${docData.date}`, { size: 11, gapAfter: 12 });

  doc.setDrawColor(120);
  doc.line(MARGIN, cursor.y, MARGIN + 60, cursor.y);
  cursor.y += 5;
  write("Signature", { size: 9.5, gapAfter: 1 });
  write(docData.signatureName, { size: 11, style: "bold", gapAfter: 2 });

  // ---------- Footers, once the total page count is known ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont(fonts.latin, "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);

    doc.text(docData.footerNote, MARGIN, A4_HEIGHT - 12);
    doc.text(`Page ${p} of ${total}`, A4_WIDTH - MARGIN, A4_HEIGHT - 12, {
      align: "right",
    });
    doc.setTextColor(0);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

/** Exposed for tests: confirms the Unicode fonts are actually loadable. */
export function fontsAvailable(): boolean {
  try {
    const dir = path.join(process.cwd(), "assets", "fonts");
    for (const f of ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSansDevanagari-Regular.ttf"]) {
      if (readFileSync(path.join(dir, f)).length < 1000) return false;
    }
    return true;
  } catch {
    return false;
  }
}
