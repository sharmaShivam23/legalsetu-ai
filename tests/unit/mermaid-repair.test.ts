import { describe, it, expect } from "vitest";
import { repairMermaid } from "@/lib/rag/mermaid-repair";

async function parses(source: string): Promise<boolean> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true });
  try {
    return Boolean(await mermaid.parse(source, { suppressErrors: true }));
  } catch {
    return false;
  }
}

describe("repairMermaid", () => {
  it("quotes labels containing parentheses and colons", () => {
    const broken = "flowchart TD\n  S([Start]) --> A[File FIR (Section 173)]\n  A --> B{Deadline: 30 days?}";
    const fixed = repairMermaid(broken);
    expect(fixed).toContain('A["File FIR (Section 173)"]');
    expect(fixed).toContain('B{"Deadline: 30 days?"}');
    expect(fixed).toContain('S(["Start"])');
  });

  it("quotes edge labels", () => {
    expect(repairMermaid("flowchart TD\nB -->|Yes: now| C")).toContain('B -->|"Yes: now"| C');
  });

  it("replaces double quotes inside a label instead of breaking the quoting", () => {
    expect(repairMermaid('flowchart TD\nA[Send "legal notice"]')).toContain(`A["Send 'legal notice'"]`);
  });

  it("adds a missing header and strips stray fences", () => {
    const fixed = repairMermaid("```mermaid\nA[Go] --> B[Stop]\n```");
    expect(fixed.split("\n")[0]).toBe("flowchart TD");
    expect(fixed).not.toContain("```");
  });

  it("normalises a `graph LR` header", () => {
    expect(repairMermaid("graph lr\nA --> B").split("\n")[0]).toBe("flowchart LR");
  });

  it("leaves already-quoted labels alone", () => {
    const ok = 'flowchart TD\nA["Already (fine)"] --> B';
    expect(repairMermaid(ok)).toBe(ok);
  });

  it("leaves style and comment lines untouched", () => {
    const src = "flowchart TD\n%% a comment\nA[One] --> B[Two]\nstyle A fill:#fff";
    const fixed = repairMermaid(src);
    expect(fixed).toContain("%% a comment");
    expect(fixed).toContain("style A fill:#fff");
  });

  it("turns a diagram Mermaid rejects into one it accepts", async () => {
    const broken = [
      "flowchart TD",
      "    S([Start]) --> A[Collect proof (rent receipts, agreement)]",
      "    A --> B{Landlord replies: within 15 days?}",
      "    B -->|Yes| C[Accept refund]",
      "    B -->|No| D[Send legal notice u/s 80 CPC]",
      "    D --> E[File suit in Civil Court (Small Causes)]",
      "    E --> F([Resolved])",
    ].join("\n");

    const before = await parses(broken);
    const after = await parses(repairMermaid(broken));
    expect(before).toBe(false);
    expect(after).toBe(true);
  });
});
