import { describe, it, expect } from "vitest";
import { isSmallTalk } from "@/lib/rag/smalltalk";

describe("isSmallTalk", () => {
  it("treats bare greetings as small talk", () => {
    for (const greeting of ["hi", "hii", "hiii", "hey", "helloo", "Hello", "  hi  "]) {
      expect(isSmallTalk(greeting), greeting).toBe(true);
    }
  });

  it("handles punctuation and enthusiasm", () => {
    expect(isSmallTalk("hi!!!")).toBe(true);
    expect(isSmallTalk("hello.")).toBe(true);
  });

  it("recognises Indian-language greetings in both scripts", () => {
    for (const greeting of ["namaste", "Namaskar", "नमस्ते", "वणक्कम".replace("वणक्कम", "வணக்கம்"), "sat sri akal"]) {
      expect(isSmallTalk(greeting), greeting).toBe(true);
    }
  });

  it("recognises thanks and sign-offs", () => {
    for (const phrase of ["thanks", "thank you", "dhanyavad", "धन्यवाद", "ok", "bye"]) {
      expect(isSmallTalk(phrase), phrase).toBe(true);
    }
  });

  it("does NOT treat a real legal question as small talk", () => {
    const realQuestions = [
      "My phone was snatched on the street. What do I do?",
      "hi, my landlord is refusing to return my deposit",
      "What is Section 303 of the BNS?",
      "Someone is threatening me online for money",
      "hello my employer has not paid me for three months",
    ];
    for (const q of realQuestions) {
      expect(isSmallTalk(q), q).toBe(false);
    }
  });

  it("does not misfire on short but substantive questions", () => {
    expect(isSmallTalk("my phone was stolen")).toBe(false);
    expect(isSmallTalk("is theft bailable")).toBe(false);
  });

  it("treats an empty message as small talk rather than a legal query", () => {
    expect(isSmallTalk("   ")).toBe(true);
  });
});
