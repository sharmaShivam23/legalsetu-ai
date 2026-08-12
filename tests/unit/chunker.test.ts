import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/rag/chunker";

describe("chunkText", () => {
  it("splits long text into multiple chunks respecting maxChars", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}. `.repeat(20));
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.text.length).toBeGreaterThan(0));
  });

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Short legal text.");
    expect(chunks.length).toBe(1);
  });
});
