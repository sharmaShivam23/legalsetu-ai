import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "@/lib/ai/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 for a zero vector to avoid NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
