import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  findPunishmentClauseSpans,
  parseAct,
  parsePunishmentClause,
  repairSplitWords,
  splitSections,
  splitSubsections,
  stripPageNumbers,
} from "@/lib/rights-clock/punishment-parser";
import {
  buildPunishmentTable,
  lookupSection,
  parseSectionRef,
  serializeTableModule,
} from "@/lib/rights-clock/punishment-table";
import { BNS_PUNISHMENT_TABLE } from "@/lib/rights-clock/bns-punishments.data";

const SOURCE = path.join("data", "01 The Bharatiya Nyaya Sanhita, 2023.md");
const ACT = readFileSync(SOURCE, "utf8");
const TABLE = buildPunishmentTable(ACT, SOURCE.replace(/\\/g, "/"));

const sub = (s: string, n?: string) => {
  const e = TABLE.sections[s];
  return n ? e.subsections[n] : e.punishment;
};

describe("punishment clause parsing (synthetic)", () => {
  it("reads a maximum term in words", () => {
    const p = parsePunishmentClause(
      "shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both."
    );
    expect(p).toMatchObject({ maxMonths: 36, minMonths: null, death: false, life: false, resolvable: true });
  });

  it("reads a minimum and life", () => {
    const p = parsePunishmentClause(
      "shall be punished with rigorous imprisonment for a term which shall not be less than ten years, but which may extend to imprisonment for life"
    );
    expect(p).toMatchObject({ life: true, minMonths: 120 });
  });

  it("ignores amounts of fine", () => {
    const p = parsePunishmentClause("shall be punished with fine which may extend to five thousand rupees.");
    expect(p).toMatchObject({ maxMonths: null, nonCustodial: true, resolvable: true });
  });

  it("separates the repeat-conviction enhancement in the same sentence", () => {
    const p = parsePunishmentClause(
      "shall be punished with imprisonment for a term which may extend to three years, and on a second or subsequent conviction, with imprisonment which may extend to seven years."
    );
    expect(p.maxMonths).toBe(36);
    expect(p.repeatMaxMonths).toBe(84);
  });

  it("treats punishment by reference as unresolvable — never guesses", () => {
    for (const clause of [
      "shall be punished with the punishment provided for the offence.",
      "shall be punished with imprisonment for a term which may extend to one-half of the longest term provided for that offence",
      "shall be punished with imprisonment for two years, in addition to the punishment provided for the offence",
    ]) {
      expect(parsePunishmentClause(clause).resolvable).toBe(false);
    }
  });

  it("handles 'not exceeding', 'may be extended to', and hours", () => {
    expect(parsePunishmentClause("shall be punished with imprisonment for a term not exceeding six months").maxMonths).toBe(6);
    expect(parsePunishmentClause("be punished with imprisonment which may be extended to fourteen years").maxMonths).toBe(168);
    expect(parsePunishmentClause("be punished with simple imprisonment for a term which may extend to twenty-four hours").maxMonths).toBeCloseTo(1 / 30, 2);
  });

  it("repairs words split by PDF extraction", () => {
    expect(repairSplitWords("may exten d t o six m onths of eit her description, which ma y")).toBe(
      "may extend to six months of either description, which may"
    );
    // Words not on the list are left alone.
    expect(repairSplitWords("a man of a ge")).toBe("a man of a ge");
  });

  it("strips printed page numbers but keeps section references and quantities", () => {
    expect(stripPageNumbers("imprisonment 95 for life")).toBe("imprisonment  for life");
    expect(stripPageNumbers("under section 64 of this")).toBe("under section 64 of this");
    expect(stripPageNumbers("( 1 ) for 10 years")).toBe("( 1 ) for 10 years");
  });

  it("flags a clause preceded by 'second or subsequent conviction' as repeat-only", () => {
    const spans = findPunishmentClauseSpans(
      "shall be punished with imprisonment which may extend to three years, and in case of second or subsequent conviction of any person under this section, he shall be punished with rigorous imprisonment for a term which may extend to five years."
    );
    expect(spans.map((s) => s.repeatOnly)).toEqual([false, true]);
  });

  it("does not split sub-sections on cross-references", () => {
    const parts = splitSubsections(
      "337. Forgery. — Whoever forges a document shall be punished with imprisonment which may extend to seven years. Explanation. — as defined in clause ( r ) of sub-section ( 1 ) of section 2."
    );
    expect(parts).toHaveLength(1);
  });
});

describe("BNS text — structure", () => {
  const sections = splitSections(ACT);

  it("finds all 358 sections in order", () => {
    expect(sections).toHaveLength(358);
    sections.forEach((s, i) => expect(s.section).toBe(String(i + 1)));
    expect(sections[302].title).toBe("Theft");
    expect(sections[357].title).toBe("Repeal and savings");
  });

  it("repairs split title capitals", () => {
    expect(TABLE.sections["61"].title).toBe("Criminal conspiracy");
  });
});

describe("BNS text — punishments match the Act", () => {
  // Ground truth checked against the bare text of the BNS.
  it.each([
    ["303", "2", 36, false, false],
    ["304", "2", 36, false, false],
    ["305", undefined, 84, false, false],
    ["318", "2", 36, false, false],
    ["318", "3", 60, false, false],
    ["318", "4", 84, false, false],
    ["115", "2", 12, false, false],
    ["85", undefined, 36, false, false],
    ["351", "2", 24, false, false],
    ["351", "3", 84, false, false],
    ["356", "2", 24, false, false],
    ["308", "2", 84, false, false],
    ["308", "5", 120, false, false],
    ["337", undefined, 84, false, false], // cross-reference "( 1 )" in its Explanation
    ["309", "4", 168, false, false], // "may be extended to fourteen years"
    ["61", "2", 6, false, false], // "not exceeding six months"
    ["103", "1", null, true, true],
    ["316", "5", 120, false, true], // page number inside "imprisonment 95 for life"
    ["89", undefined, 120, false, true], // page number inside "shall be 43 punished"
  ] as const)("BNS §%s(%s): max %s, death %s, life %s", (s, n, max, death, life) => {
    const p = sub(s, n);
    expect(p).not.toBeNull();
    expect(p!.maxMonths).toBe(max);
    expect(p!.death).toBe(death);
    expect(p!.life).toBe(life);
    expect(p!.resolvable).toBe(true);
  });

  it("reads mandatory minimums", () => {
    expect(sub("64", "1")).toMatchObject({ life: true, minMonths: 120 });
    expect(sub("74")).toMatchObject({ minMonths: 12, maxMonths: 60 });
    expect(sub("121", "2")).toMatchObject({ minMonths: 12, maxMonths: 120 }); // "ma y extend"
    expect(sub("117", "3")).toMatchObject({ life: true, minMonths: 120 });
  });

  it("keeps the theft repeat-conviction enhancement separate", () => {
    expect(sub("303", "2")).toMatchObject({ maxMonths: 36, repeatMaxMonths: 60 });
    expect(sub("78", "2")).toMatchObject({ maxMonths: 36, repeatMaxMonths: 60 });
  });

  it("marks abetment, attempt and harbouring as unresolvable", () => {
    for (const s of ["49", "62", "249"]) expect(TABLE.sections[s].punishment?.resolvable).toBe(false);
    expect(sub("351", "4")!.resolvable).toBe(false);
  });

  it("reports definition-only sections as having no punishment", () => {
    for (const s of ["63", "100", "101", "114"]) expect(TABLE.sections[s].punishment).toBeNull();
  });

  it("finds fine-only offences", () => {
    expect(sub("292")).toMatchObject({ nonCustodial: true, maxMonths: null });
  });

  it("keeps the parse broad: most sections from §45 on carry a punishment", () => {
    const offences = Object.entries(TABLE.sections).filter(([s]) => Number(s) >= 45);
    const withPunishment = offences.filter(([, e]) => e.punishment !== null);
    expect(withPunishment.length / offences.length).toBeGreaterThan(0.8);
  });
});

describe("committed table", () => {
  it("is exactly what the generator produces from the current BNS text (no drift)", () => {
    const committed = readFileSync(path.join("lib", "rights-clock", "bns-punishments.data.ts"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(serializeTableModule(TABLE));
  });

  it("loads at runtime and is tied to the source text by hash", () => {
    expect(BNS_PUNISHMENT_TABLE.sourceHash).toBe(TABLE.sourceHash);
    expect(Object.keys(BNS_PUNISHMENT_TABLE.sections)).toHaveLength(358);
  });

  it("whole-act parse is stable", () => {
    expect(parseAct(ACT)).toHaveLength(358);
  });
});

describe("section references", () => {
  it.each([
    ["303(2)", "303", "2"],
    ["303 (2)", "303", "2"],
    ["BNS 303(2)", "303", "2"],
    ["bns 318(4)", "318", "4"],
    ["s. 115(2)", "115", "2"],
    ["u/s 64(1)", "64", "1"],
    ["Section 351(3)", "351", "3"],
    ["303/2", "303", "2"],
    ["64(2)(a)", "64", "2"],
    ["305", "305", undefined],
    ["0303", "303", undefined],
  ])("parses %s", (raw, section, n) => {
    expect(parseSectionRef(raw)).toMatchObject({ section, sub: n });
  });

  it.each(["murder", "", "IPC", "303(2", "12345"])("rejects %s", (raw) => {
    expect(parseSectionRef(raw)).toBeNull();
  });

  it("looks up with status", () => {
    expect(lookupSection(TABLE, parseSectionRef("303(2)")!).status).toBe("OK");
    expect(lookupSection(TABLE, parseSectionRef("318")!).status).toBe("SECTION_LEVEL");
    expect(lookupSection(TABLE, parseSectionRef("303(9)")!).status).toBe("NOT_FOUND");
    expect(lookupSection(TABLE, parseSectionRef("999")!).status).toBe("NOT_FOUND");
    expect(lookupSection(TABLE, parseSectionRef("101")!).status).toBe("NO_PUNISHMENT");
    expect(lookupSection(TABLE, parseSectionRef("49")!).status).toBe("UNRESOLVABLE");
  });
});
