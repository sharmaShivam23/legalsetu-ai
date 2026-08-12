import { describe, it, expect } from "vitest";
import { buildRAGMessages, buildContextBlock } from "@/lib/rag/prompt";
import type { RetrievedChunk } from "@/lib/rag/types";

const sampleChunk: RetrievedChunk = {
  chunkId: "1",
  sourceId: "s1",
  sourceTitle: "[DEMO] Sample Act",
  actName: "[DEMO] Sample Act",
  section: "5",
  jurisdiction: "DEMO",
  officialUrl: null,
  verificationStatus: "VERIFIED",
  text: "Demo statute text.",
  similarity: 0.9,
};

describe("RAG prompt construction", () => {
  it("includes retrieved data as context, not instructions", () => {
    const block = buildContextBlock([sampleChunk]);
    expect(block).toContain("RETRIEVED LEGAL DATA");
    expect(block).toContain("Demo statute text.");
  });

  it("handles empty retrieval gracefully", () => {
    const block = buildContextBlock([]);
    expect(block).toContain("No relevant verified sources were found");
  });

  it("builds a full message array with system, context, and user turns", () => {
    const messages = buildRAGMessages("What are my tenancy rights?", [sampleChunk]);
    expect(messages[0].role).toBe("system");
    expect(messages.some((m) => m.role === "user")).toBe(true);
  });
});
