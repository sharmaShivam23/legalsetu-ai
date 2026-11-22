import { describe, expect, it } from "vitest";
import { runRightsClock, type RightsClockInput } from "@/lib/rights-clock";
import { bucketFor, dueReminders } from "@/lib/rights-clock/reminders";
import { buildRightsClockReminderEmail } from "@/lib/email/templates";

const input: RightsClockInput = {
  arrestDate: "2026-08-30",
  firstRemandDate: "2026-08-31",
  sections: ["303(2)"],
  otherLawCharges: false,
  chargesheetFiledOn: null,
  priorConviction: "NO",
  otherPendingCases: "NO",
  inCustody: true,
};
// Default bail right arises 2026-10-30.
const at = (today: string, sent: string[] = [], patch: Partial<RightsClockInput> = {}) =>
  dueReminders(runRightsClock({ ...input, ...patch }, today), sent, today);

describe("reminder buckets", () => {
  it.each([
    [8, null],
    [7, "T-7"],
    [2, "T-7"],
    [1, "T-1"],
    [0, "T-0"],
    [-3, "T-0"],
    [-4, null],
  ])("%s days before → %s", (days, bucket) => {
    expect(bucketFor(days)).toBe(bucket);
  });
});

describe("dueReminders", () => {
  it("nothing more than a week out", () => {
    expect(at("2026-10-22")).toEqual([]);
  });

  it("T-7, T-1 and T-0 for the default bail date", () => {
    expect(at("2026-10-23").map((d) => d.key)).toEqual(["DEFAULT_BAIL_60@2026-10-30:T-7"]);
    expect(at("2026-10-29").map((d) => d.bucket)).toEqual(["T-1"]);
    expect(at("2026-10-30").map((d) => d.bucket)).toEqual(["T-0"]);
  });

  it("is idempotent — a sent key is never sent again", () => {
    expect(at("2026-10-24", ["DEFAULT_BAIL_60@2026-10-30:T-7"])).toEqual([]);
  });

  it("never sends an earlier bucket after a later one", () => {
    // Job ran late on the 29th (T-1 sent); a rerun must not fall back to T-7.
    expect(at("2026-10-29", ["DEFAULT_BAIL_60@2026-10-30:T-1"])).toEqual([]);
  });

  it("a missed day still produces the most relevant reminder, within the grace window", () => {
    expect(at("2026-11-02").map((d) => d.bucket)).toEqual(["T-0"]);
    expect(at("2026-11-03")).toEqual([]);
  });

  it("a changed date produces fresh reminders (key includes the date)", () => {
    const moved = at("2026-10-24", ["DEFAULT_BAIL_60@2026-10-30:T-7"], { firstRemandDate: "2026-09-01" });
    expect(moved.map((d) => d.key)).toEqual(["DEFAULT_BAIL_60@2026-10-31:T-7"]);
  });

  it("does not remind about reference-only (§479(2)-barred) dates", () => {
    const due = at("2027-08-27", [], { sections: ["303(2)", "351(2)"], chargesheetFiledOn: "2026-10-01" });
    expect(due.find((d) => d.milestone.key.startsWith("S479"))).toBeUndefined();
  });

  it("reminds about §479 dates when they apply", () => {
    const due = at("2027-08-24", [], { chargesheetFiledOn: "2026-10-01" });
    expect(due.map((d) => d.key)).toEqual(["S479_ONE_THIRD@2027-08-31:T-7"]);
  });

  it("nothing once the chargesheet is filed in time and nothing else is near", () => {
    expect(at("2026-10-30", [], { chargesheetFiledOn: "2026-10-01" })).toEqual([]);
  });
});

describe("reminder email", () => {
  const mail = buildRightsClockReminderEmail({
    name: "Asha Verma",
    personName: "Ravi <script>",
    items: [{ label: "Default bail (60-day period)", when: "30 Oct 2026 — today", urgent: true }],
    nextAction: "File a default bail application",
    trackerUrl: "https://legalsetu.example/dashboard/rights-clock/abc",
  });

  it("escapes user-entered names", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Ravi &lt;script&gt;");
  });

  it("flags urgency in the subject and keeps charges out of the inbox preview", () => {
    expect(mail.subject).toMatch(/^Action needed today/);
    expect(mail.html).not.toMatch(/BNS|303/);
    expect(mail.text).toContain("https://legalsetu.example/dashboard/rights-clock/abc");
    expect(mail.text).toContain("15100");
  });
});
