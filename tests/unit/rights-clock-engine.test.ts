import { describe, expect, it } from "vitest";
import { runRightsClock, type RightsClockInput } from "@/lib/rights-clock";
import { addDays, addMonths, daysBetween, formatDate, formatMonths, isISODate, todayInIndia } from "@/lib/rights-clock/dates";

const base: RightsClockInput = {
  arrestDate: "2026-08-30",
  firstRemandDate: "2026-08-31",
  sections: ["303(2)"],
  otherLawCharges: false,
  chargesheetFiledOn: null,
  priorConviction: "NO",
  otherPendingCases: "NO",
  inCustody: true,
};

const run = (patch: Partial<RightsClockInput>, today: string) => runRightsClock({ ...base, ...patch }, today);

describe("date arithmetic", () => {
  it("validates real calendar dates only", () => {
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2027-02-29")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("26-01-01")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("clamps month addition to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
    expect(addMonths("2026-08-30", 36)).toBe("2029-08-30");
  });

  it("uses India's date, not the server's", () => {
    // 20:00 UTC on 9 Nov is already 10 Nov in India (UTC+5:30).
    expect(todayInIndia(new Date("2026-11-09T20:00:00Z"))).toBe("2026-11-10");
    expect(todayInIndia(new Date("2026-11-09T18:00:00Z"))).toBe("2026-11-09");
  });

  it("formats unambiguously", () => {
    expect(formatDate("2026-03-05")).toBe("5 Mar 2026");
    expect(formatMonths(18)).toBe("1 year 6 months");
    expect(formatMonths(84)).toBe("7 years");
  });
});

describe("default bail — BNSS §187(3)", () => {
  it("60-day offence: counts the remand day as day 1 (Kapil Wadhawan)", () => {
    const r = run({}, "2026-10-15");
    expect(r.defaultBail.periods).toHaveLength(1);
    const p = r.defaultBail.periods[0];
    expect(p.days).toBe(60);
    // 31 Aug is day 1, so day 60 is 29 Oct and the right arises on 30 Oct.
    expect(p.lastDay).toBe("2026-10-29");
    expect(p.rightArisesOn).toBe("2026-10-30");
    expect(daysBetween("2026-08-31", p.lastDay) + 1).toBe(60);
    expect(r.defaultBail.status).toBe("UPCOMING");
    expect(r.defaultBail.daysUntilEarliest).toBe(15);
  });

  it("becomes AVAILABLE_NOW on the day the right arises, with an urgent next action", () => {
    const r = run({}, "2026-10-30");
    expect(r.defaultBail.status).toBe("AVAILABLE_NOW");
    expect(r.nextAction).toMatchObject({ urgent: true, due: "2026-10-30" });
    expect(r.nextAction!.text).toMatch(/default bail/i);
  });

  it("is still UPCOMING on the last day of the period", () => {
    expect(run({}, "2026-10-29").defaultBail.status).toBe("UPCOMING");
  });

  it("90 days for death / life offences", () => {
    const r = run({ sections: ["103(1)"] }, "2026-10-01");
    expect(r.offences[0].periodClass).toBe("NINETY");
    expect(r.defaultBail.periods.map((p) => p.days)).toEqual([90]);
    expect(r.defaultBail.periods[0].rightArisesOn).toBe(addDays("2026-08-31", 90));
  });

  it("90 days for a 10-year mandatory minimum", () => {
    expect(run({ sections: ["64(1)"] }, "2026-10-01").offences[0].periodClass).toBe("NINETY");
  });

  it("shows BOTH dates when the maximum reaches 10 years without a 10-year minimum", () => {
    const r = run({ sections: ["308(5)"], firstRemandDate: "2026-08-02", arrestDate: "2026-08-01" }, "2026-09-01");
    expect(r.offences[0].periodClass).toBe("DISPUTED");
    expect(r.defaultBail.periods.map((p) => [p.days, p.rightArisesOn])).toEqual([
      [60, "2026-10-01"],
      [90, "2026-10-31"],
    ]);
    expect(r.milestones.find((m) => m.key === "DEFAULT_BAIL_60")!.certainty).toBe("CONTESTED");
    expect(r.milestones.find((m) => m.key === "DEFAULT_BAIL_90")!.certainty).toBe("CERTAIN");
  });

  it("disputed: ARGUABLE between the two dates, AVAILABLE after both", () => {
    const p = { sections: ["308(5)"], firstRemandDate: "2026-08-02", arrestDate: "2026-08-01" };
    expect(run(p, "2026-10-10").defaultBail.status).toBe("ARGUABLE_NOW");
    expect(run(p, "2026-10-31").defaultBail.status).toBe("AVAILABLE_NOW");
  });

  it("the gravest charge decides the period", () => {
    const r = run({ sections: ["303(2)", "103(1)"] }, "2026-09-10");
    expect(r.defaultBail.periods.map((p) => p.days)).toEqual([90]);
  });

  it("chargesheet within the period: not available", () => {
    const r = run({ chargesheetFiledOn: "2026-10-29" }, "2026-11-09");
    expect(r.defaultBail.status).toBe("CHARGESHEET_IN_TIME");
    expect(r.milestones.some((m) => m.key.startsWith("DEFAULT_BAIL"))).toBe(false);
  });

  it("chargesheet after the right arose: survives only if applied for first", () => {
    const r = run({ chargesheetFiledOn: "2026-11-02" }, "2026-11-09");
    expect(r.defaultBail.status).toBe("CHARGESHEET_LATE");
    expect(r.defaultBail.explanation.join(" ")).toMatch(/Ravindran/);
  });

  it("chargesheet between day 60 and day 90 in a disputed case: CONTESTED", () => {
    const r = run(
      { sections: ["308(5)"], firstRemandDate: "2026-08-02", arrestDate: "2026-08-01", chargesheetFiledOn: "2026-10-15" },
      "2026-11-09"
    );
    expect(r.defaultBail.status).toBe("CONTESTED");
  });

  it("estimates the clock start as the day after arrest when remand date is missing", () => {
    const r = run({ firstRemandDate: null }, "2026-09-01");
    expect(r.defaultBail.clockStartsOn).toBe("2026-08-31");
    expect(r.defaultBail.clockStartEstimated).toBe(true);
    expect(r.milestones.find((m) => m.key === "REMAND")!.certainty).toBe("CONDITIONAL");
  });

  it("refuses to compute when another law is charged", () => {
    const r = run({ otherLawCharges: true }, "2026-10-01");
    expect(r.defaultBail.status).toBe("NOT_COMPUTABLE");
    expect(r.section479.status).toBe("NOT_COMPUTABLE");
    expect(r.defaultBail.explanation.join(" ")).toMatch(/NDPS/);
  });

  it("shows both dates and warns when a section cannot be classified", () => {
    const r = run({ sections: ["49"] }, "2026-09-01");
    expect(r.defaultBail.periods.map((p) => p.days)).toEqual([60, 90]);
    expect(r.warnings.join(" ")).toMatch(/could not be classified/);
  });

  it("warns about a late first production", () => {
    const r = run({ firstRemandDate: "2026-09-05" }, "2026-09-10");
    expect(r.warnings.join(" ")).toMatch(/24 hours/);
  });
});

describe("release after part-serving — BNSS §479", () => {
  it("first-time offender: one-third; everyone else: one-half (leap-year aware)", () => {
    const r = run({}, "2026-11-09");
    // 3 years from 30 Aug 2026 = 1,096 days (includes 29 Feb 2028).
    expect(r.section479).toMatchObject({
      status: "UPCOMING",
      maxMonths: 36,
      oneThirdOn: "2027-08-31", // +366 days (ceil 1096/3)
      oneHalfOn: "2028-02-29", // +548 days
      absoluteLimitOn: "2029-08-30",
      applicableFraction: "ONE_THIRD",
    });
    expect(r.milestones.some((m) => m.key === "S479_ONE_HALF")).toBe(false);
  });

  it("prior conviction uses one-half and the enhanced repeat maximum", () => {
    const r = run({ priorConviction: "YES" }, "2026-11-09");
    expect(r.section479.maxMonths).toBe(60);
    expect(r.section479.applicableFraction).toBe("ONE_HALF");
    expect(r.section479.oneHalfOn).toBe(addDays("2026-08-30", Math.ceil(daysBetween("2026-08-30", "2031-08-30") / 2)));
  });

  it("unknown history: shows both dates and warns", () => {
    const r = run({ priorConviction: "UNKNOWN" }, "2026-11-09");
    expect(r.section479.applicableFraction).toBeNull();
    expect(r.milestones.map((m) => m.key)).toEqual(expect.arrayContaining(["S479_ONE_THIRD", "S479_ONE_HALF"]));
    expect(r.warnings.join(" ")).toMatch(/convicted before/);
  });

  it("ELIGIBLE_NOW once the period is served", () => {
    const r = run({ sections: ["304(2)"], arrestDate: "2025-01-10", firstRemandDate: "2025-01-11", chargesheetFiledOn: "2025-03-01" }, "2026-11-09");
    expect(r.section479.status).toBe("ELIGIBLE_NOW");
    expect(r.section479.oneThirdOn).toBe("2026-01-10");
    expect(r.nextAction!.text).toMatch(/479/);
  });

  it("excluded for death / life offences", () => {
    const r = run({ sections: ["103(1)"] }, "2026-11-09");
    expect(r.section479.status).toBe("EXCLUDED_DEATH_OR_LIFE");
    expect(r.milestones.some((m) => m.key.startsWith("S479"))).toBe(false);
  });

  it("§479(2): more than one offence → BARRED, dates kept for reference and never reminded", () => {
    const r = run({ sections: ["303(2)", "351(2)"] }, "2026-11-09");
    expect(r.section479.status).toBe("BARRED_MULTIPLE");
    expect(r.section479.oneThirdOn).not.toBeNull();
    expect(r.milestones.find((m) => m.key === "S479_ONE_THIRD")!.certainty).toBe("REFERENCE");
  });

  it("§479(2): another pending case → BARRED", () => {
    expect(run({ otherPendingCases: "YES" }, "2026-11-09").section479.status).toBe("BARRED_MULTIPLE");
  });

  it("general provisions such as §3(5) are ignored, not counted as a second offence", () => {
    const r = run({ sections: ["303(2)", "3(5)"] }, "2026-11-09");
    expect(r.section479.status).toBe("UPCOMING");
    const common = r.offences.find((o) => o.input === "3(5)")!;
    expect(common.ignored).toBe(true);
  });

  it("detention past the maximum sentence is flagged as illegal, even when barred", () => {
    const r = run({ sections: ["115(2)", "351(2)"], arrestDate: "2024-01-01", firstRemandDate: "2024-01-02" }, "2026-11-09");
    expect(r.section479.status).toBe("MAXIMUM_EXCEEDED");
    expect(r.section479.absoluteLimitOn).toBe("2026-01-01"); // 2 years (351(2)) from arrest
    expect(r.nextAction).toMatchObject({ urgent: true });
    expect(r.nextAction!.text).toMatch(/maximum sentence/i);
  });

  it("fine-only offence: flags custody itself", () => {
    expect(run({ sections: ["292"] }, "2026-11-09").section479.status).toBe("NOT_IMPRISONABLE");
  });

  it("unresolvable section: refuses to compute", () => {
    const r = run({ sections: ["62"] }, "2026-11-09");
    expect(r.section479.status).toBe("NOT_COMPUTABLE");
    expect(r.offences[0].problem).toMatch(/reference to another offence/);
  });
});

describe("input handling", () => {
  it("rejects future and inconsistent dates", () => {
    expect(run({ arrestDate: "2026-12-01" }, "2026-11-09").inputErrors).toContain("The arrest date cannot be in the future.");
    expect(run({ firstRemandDate: "2026-08-01" }, "2026-11-09").inputErrors[0]).toMatch(/before the arrest/);
    expect(run({ chargesheetFiledOn: "2026-12-01" }, "2026-11-09").inputErrors[0]).toMatch(/future/);
    expect(run({ arrestDate: "2026-02-30" }, "2026-11-09").inputErrors[0]).toMatch(/valid arrest date/);
  });

  it("requires at least one real offence", () => {
    expect(run({ sections: [] }, "2026-11-09").inputErrors[0]).toMatch(/at least one/);
    const general = run({ sections: ["3(5)"] }, "2026-11-09");
    expect(general.inputErrors[0]).toMatch(/general provisions/);
    expect(general.offences).toHaveLength(1);
  });

  it("explains bad section numbers instead of guessing", () => {
    const r = run({ sections: ["303(2)", "murder", "999", "101"] }, "2026-11-09");
    const problems = Object.fromEntries(r.offences.map((o) => [o.input, o.problem ?? ""]));
    expect(problems["murder"]).toMatch(/not a BNS section/);
    expect(problems["999"]).toMatch(/358 sections/);
    expect(problems["101"]).toMatch(/§103/);
  });

  it("de-duplicates repeated sections", () => {
    const r = run({ sections: ["303(2)", " 303(2) "] }, "2026-11-09");
    expect(r.offences).toHaveLength(1);
    expect(r.section479.status).toBe("UPCOMING");
  });

  it("warns when a sub-section is missing", () => {
    expect(run({ sections: ["318"] }, "2026-11-09").warnings.join(" ")).toMatch(/sub-section/);
  });

  it("not in custody: nothing to act on", () => {
    const r = run({ inCustody: false }, "2026-11-09");
    expect(r.defaultBail.status).toBe("NOT_IN_CUSTODY");
    expect(r.section479.status).toBe("NOT_IN_CUSTODY");
    expect(r.nextAction).toBeNull();
  });

  it("milestones are sorted and marked passed relative to today", () => {
    const r = run({}, "2026-11-09");
    const dates = r.milestones.map((m) => m.date);
    expect(dates).toEqual([...dates].sort());
    expect(r.milestones.find((m) => m.key === "ARREST")!.passed).toBe(true);
    expect(r.milestones.find((m) => m.key === "MAX_SENTENCE")!.passed).toBe(false);
  });

  it("is deterministic", () => {
    expect(run({}, "2026-11-09")).toEqual(run({}, "2026-11-09"));
  });

  it("always cites its legal basis and data source", () => {
    const r = run({}, "2026-11-09");
    expect(r.authorities.map((a) => a.citation).join(" ")).toMatch(/Kapil Wadhawan/);
    expect(r.arrestRights.length).toBeGreaterThanOrEqual(5);
    expect(r.dataSource.sourceHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
