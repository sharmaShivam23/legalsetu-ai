import { describe, it, expect } from "vitest";
import { toSpeakable, extractSentences } from "@/lib/voice/speech-text";

describe("toSpeakable", () => {
  it("drops heading markers but keeps the words", () => {
    expect(toSpeakable("## Answer\nTheft is defined in law.")).toBe("Answer. Theft is defined in law.");
  });

  it("removes fenced blocks entirely, including the case-mode flowchart", () => {
    expect(toSpeakable("Do this first.\n```mermaid\ngraph TD\nA-->B\n```\nThen file it.")).toBe(
      "Do this first. Then file it."
    );
  });

  it("removes a fence that is still streaming in and has no closing ticks", () => {
    expect(toSpeakable("Next steps below.\n```mermaid\ngraph TD\nA--")).toBe("Next steps below.");
  });

  it("drops table rows rather than reading them cell by cell", () => {
    expect(toSpeakable("Plan:\n| # | Action |\n| --- | --- |\n| 1 | Go to the police |\nDone.")).toBe(
      "Plan:. Done."
    );
  });

  it("strips bare citation markers", () => {
    expect(toSpeakable("Section 303 applies [1].")).toBe("Section 303 applies.");
  });

  it("keeps link text and discards the URL", () => {
    expect(toSpeakable("See [India Code](https://indiacode.gov.in) now.")).toBe("See India Code now.");
  });

  it("unwraps emphasis and inline code", () => {
    expect(toSpeakable("This is **very** *important* and `exact`.")).toBe("This is very important and exact.");
  });

  it("strips list bullets and numbering", () => {
    expect(toSpeakable("- first point\n- second point")).toBe("first point. second point");
    expect(toSpeakable("1. first\n2. second")).toBe("first. second");
  });
});

describe("extractSentences", () => {
  it("holds back a sentence that has not finished arriving", () => {
    expect(extractSentences("Theft is defined in")).toEqual({
      sentences: [],
      rest: "Theft is defined in",
    });
  });

  it("emits a finished sentence and carries the tail", () => {
    expect(extractSentences("Theft is defined in law. Next")).toEqual({
      sentences: ["Theft is defined in law."],
      rest: "Next",
    });
  });

  it("treats the Devanagari danda as a sentence end", () => {
    expect(extractSentences("यह एक कानूनी सवाल है। अगला भाग")).toEqual({
      sentences: ["यह एक कानूनी सवाल है।"],
      rest: "अगला भाग",
    });
  });

  it("merges a fragment too short to be worth its own audio clip", () => {
    expect(extractSentences("Yes. That is correct in law. ")).toEqual({
      sentences: ["Yes. That is correct in law."],
      rest: "",
    });
  });

  it("emits several sentences from one chunk", () => {
    expect(extractSentences("First full sentence here. Second full sentence here. tail")).toEqual({
      sentences: ["First full sentence here.", "Second full sentence here."],
      rest: "tail",
    });
  });
});

describe("streaming pipeline", () => {
  it("speaks each sentence exactly once and never speaks Markdown", () => {
    // Mirrors the loop voice mode runs as tokens arrive.
    const chunks = [
      "## Answer\nTheft is ",
      "defined in Section 303. ",
      "You should file an FIR promptly. ",
      "```mermaid\ngraph TD\n```",
    ];

    let accumulated = "";
    let spokenTail = "";
    const spoken: string[] = [];

    for (const chunk of chunks) {
      accumulated += chunk;
      const speakable = toSpeakable(accumulated);
      if (speakable.length > spokenTail.length) {
        const fresh = speakable.slice(spokenTail.length);
        const { sentences, rest } = extractSentences(fresh);
        if (sentences.length) {
          spoken.push(...sentences);
          spokenTail = speakable.slice(0, speakable.length - rest.length);
        }
      }
    }

    expect(spoken).toEqual([
      "Answer. Theft is defined in Section 303.",
      "You should file an FIR promptly.",
    ]);
    expect(spoken.join(" ")).not.toContain("#");
    expect(spoken.join(" ")).not.toContain("mermaid");
  });
});
