// ==========================================================
// LegalSetu — Rights Clock: custody-rights engine
// ----------------------------------------------------------
// Given an arrest date and the BNS sections charged, computes
// the dates on which an undertrial's statutory rights to release
// arise:
//
//   • Default ("statutory") bail — BNSS §187(3): if no charge-
//     sheet is filed within 60/90 days of the first remand, the
//     accused has an indefeasible right to bail.
//   • Release after part-serving — BNSS §479: an undertrial who
//     has spent one-half (one-third for a first-time offender)
//     of the maximum sentence in detention must be released.
//   • The absolute ceiling — §479, third proviso: no undertrial
//     may be detained longer than the maximum sentence itself.
//
// Design rules, in order of importance:
//   1. Deterministic. No LLM is involved; the same input always
//      gives the same dates, and every rule cites its source.
//   2. Never overstate. Where the law is contested (the 60 vs 90
//      day question for 10-year offences) BOTH dates are shown,
//      labelled. Where an input is unknown, the engine says so
//      instead of assuming the favourable answer.
//   3. Never compute from a guess. A section whose punishment is
//      defined by reference to another offence, or a charge under
//      a special law, stops the relevant computation with a
//      plain-language reason.
// ==========================================================

import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  formatMonths,
  isISODate,
  type ISODate,
} from "./dates";
import type { PunishmentProfile } from "./punishment-parser";
import {
  lookupSection,
  parseSectionRef,
  type LookupResult,
  type PunishmentTable,
} from "./punishment-table";

// ---------- Input ----------

export type TriState = "YES" | "NO" | "UNKNOWN";

export interface RightsClockInput {
  /** Date of arrest (start of detention). */
  arrestDate: ISODate;
  /** Date the magistrate first authorised custody (remand). Optional — estimated if absent. */
  firstRemandDate?: ISODate | null;
  /** BNS sections charged, as typed: "303(2)", "BNS 318(4)" … */
  sections: string[];
  /** Any charge under a law other than the BNS (NDPS, UAPA, PMLA, Arms Act, POCSO, IT Act …). */
  otherLawCharges: boolean;
  /** Date the police filed the chargesheet / final report, if they have. */
  chargesheetFiledOn?: ISODate | null;
  /** Has the person EVER been convicted of any offence before? */
  priorConviction: TriState;
  /** Is any OTHER case pending against the person? */
  otherPendingCases: TriState;
  /** Still in custody today? */
  inCustody: boolean;
}

// ---------- Output ----------

export type PeriodClass = "SIXTY" | "NINETY" | "DISPUTED" | "UNKNOWN";

export interface OffenceAnalysis {
  input: string;
  citation: string;
  title?: string;
  lookupStatus: LookupResult["status"] | "INVALID";
  punishment?: PunishmentProfile;
  /** Maximum term actually used for this person (repeat-conviction enhancement applied if relevant). */
  effectiveMaxMonths: number | null;
  /** Plain-language summary: "Up to 3 years, or fine, or both". */
  punishmentSummary?: string;
  periodClass: PeriodClass;
  problem?: string;
  /**
   * General provisions (Chapters I–III, §1–44: definitions, joint
   * liability such as §3(5), general exceptions) are not offences.
   * They appear on FIRs all the time and are noted but not counted.
   */
  ignored?: boolean;
  note?: string;
}

/** Chapters I–III of the BNS (preliminary, punishments, general exceptions) end at §44. */
const LAST_GENERAL_PROVISION = 44;

export type DefaultBailStatus =
  | "NOT_IN_CUSTODY"
  | "NOT_COMPUTABLE"
  | "UPCOMING"
  /** The earlier (contested) date has passed; the certain one has not. */
  | "ARGUABLE_NOW"
  | "AVAILABLE_NOW"
  | "CHARGESHEET_IN_TIME"
  /** Chargesheet filed after the right arose — survives only if bail was applied for first. */
  | "CHARGESHEET_LATE"
  /** Chargesheet filed between the two contested dates. */
  | "CONTESTED";

export interface DefaultBailPeriod {
  days: 60 | 90;
  /** Last day of the permitted custody period. */
  lastDay: ISODate;
  /** First day on which the right to default bail exists. */
  rightArisesOn: ISODate;
  basis: string;
}

export interface DefaultBailResult {
  status: DefaultBailStatus;
  clockStartsOn: ISODate | null;
  clockStartEstimated: boolean;
  periods: DefaultBailPeriod[];
  /** Days until the earliest right arises (negative once passed). */
  daysUntilEarliest: number | null;
  headline: string;
  explanation: string[];
}

export type Section479Status =
  | "NOT_IN_CUSTODY"
  | "NOT_COMPUTABLE"
  | "EXCLUDED_DEATH_OR_LIFE"
  | "NOT_IMPRISONABLE"
  | "UPCOMING"
  | "ELIGIBLE_NOW"
  /** §479(2): more than one offence / multiple cases. Dates shown for reference only. */
  | "BARRED_MULTIPLE"
  /** Detained longer than the maximum sentence — illegal under the third proviso. */
  | "MAXIMUM_EXCEEDED";

export interface Section479Result {
  status: Section479Status;
  governingCitation: string | null;
  maxMonths: number | null;
  daysDetained: number;
  /** Release-on-bond date for a first-time offender (one-third). */
  oneThirdOn: ISODate | null;
  /** Release-on-bail date (one-half). */
  oneHalfOn: ISODate | null;
  /** Which of the two applies to this person: null when prior conviction is unknown. */
  applicableFraction: "ONE_THIRD" | "ONE_HALF" | null;
  /** Date by which detention becomes illegal in every case (maximum sentence served). */
  absoluteLimitOn: ISODate | null;
  headline: string;
  explanation: string[];
}

export interface Milestone {
  key: string;
  date: ISODate;
  label: string;
  certainty: "CERTAIN" | "CONTESTED" | "CONDITIONAL" | "REFERENCE";
  passed: boolean;
}

export interface RightCard {
  title: string;
  body: string;
  citation: string;
}

export interface Authority {
  citation: string;
  holding: string;
}

export interface RightsClockResult {
  computedOn: ISODate;
  inputErrors: string[];
  offences: OffenceAnalysis[];
  defaultBail: DefaultBailResult;
  section479: Section479Result;
  milestones: Milestone[];
  nextAction: { text: string; due: ISODate | null; urgent: boolean } | null;
  warnings: string[];
  arrestRights: RightCard[];
  authorities: Authority[];
  dataSource: { act: string; source: string; sourceHash: string };
}

// ---------- Legal constants ----------

/** Ten years, in months — the BNSS §187(3)(i) threshold. */
const TEN_YEARS = 120;

export const AUTHORITIES: Authority[] = [
  {
    citation: "BNSS §187(3)",
    holding:
      "Custody during investigation may not exceed 90 days for an offence punishable with death, imprisonment for life or imprisonment for a term of ten years or more, and 60 days for any other offence. After that, the accused must be released on bail if prepared to furnish it.",
  },
  {
    citation: "Enforcement Directorate v. Kapil Wadhawan, 2023 INSC 723 (SC, 3 judges)",
    holding: "The day of the first remand is INCLUDED when counting the 60/90-day period.",
  },
  {
    citation: "M. Ravindran v. Intelligence Officer, DRI (SC, 2020)",
    holding:
      "The right to default bail is enforceable if the accused applies for it before the chargesheet is filed; filing the chargesheet afterwards does not defeat an application already made.",
  },
  {
    citation: "BNSS §187(3) — '10 years or more' (unsettled)",
    holding:
      "High Courts are divided on whether an offence punishable with imprisonment that MAY EXTEND to ten years (but has a lower minimum) attracts 60 or 90 days. LegalSetu shows both dates whenever this applies.",
  },
  {
    citation: "BNSS §479(1)",
    holding:
      "An undertrial (not charged with an offence punishable with death or life imprisonment) who has been detained for one-half of the maximum sentence shall be released on bail; a first-time offender (never convicted of any offence) shall be released on bond after one-third.",
  },
  {
    citation: "BNSS §479(1), third proviso",
    holding: "No undertrial may be detained for longer than the maximum period of imprisonment provided for the offence.",
  },
  {
    citation: "BNSS §479(2)",
    holding:
      "Where investigation, inquiry or trial is pending for more than one offence or in multiple cases, release under §479(1) is not available (subject to the third proviso).",
  },
  {
    citation: "BNSS §479(3)",
    holding:
      "The jail superintendent must apply in writing to the court for release as soon as the one-half / one-third period is completed.",
  },
  {
    citation: "In Re: Inhuman Conditions in 1382 Prisons (SC, August 2024)",
    holding: "The Supreme Court directed that §479 apply to undertrials whose cases began before BNSS came into force on 1 July 2024.",
  },
];

export const ARREST_RIGHTS: RightCard[] = [
  {
    title: "To be told why",
    body: "Police must tell the arrested person the grounds of arrest immediately. If the offence is bailable, they must also say that the person can be released on bail.",
    citation: "BNSS §47; Constitution Art. 22(1)",
  },
  {
    title: "Family must be informed",
    body: "Police must inform a relative, friend or another person named by the arrested person about the arrest and where they are held.",
    citation: "BNSS §48",
  },
  {
    title: "Before a magistrate within 24 hours",
    body: "The arrested person must be produced before the nearest magistrate within 24 hours (journey time excluded). Holding them longer without a magistrate's order is illegal.",
    citation: "BNSS §58; Constitution Art. 22(2)",
  },
  {
    title: "To meet a lawyer",
    body: "The arrested person may meet an advocate of their choice during interrogation, though not necessarily throughout it.",
    citation: "BNSS §38",
  },
  {
    title: "Free legal aid",
    body: "Every person in custody is entitled to a free lawyer from the Legal Services Authority, regardless of income. Call the NALSA helpline 15100 or contact the District Legal Services Authority (DLSA) at the district court.",
    citation: "Constitution Art. 39A; Legal Services Authorities Act, 1987, §12(g)",
  },
  {
    title: "Bail as of right in bailable offences",
    body: "For a bailable offence, bail is a right, not a favour — the police officer or court must release the person on bail if they are ready to give it.",
    citation: "BNSS §478",
  },
];

// ---------- Helpers ----------

function effectiveMax(p: PunishmentProfile, priorConviction: TriState): number | null {
  if (priorConviction === "YES" && p.repeatMaxMonths !== null) return p.repeatMaxMonths;
  return p.maxMonths;
}

export function summarisePunishment(p: PunishmentProfile): string {
  if (p.nonCustodial) return "Fine / community service only — no imprisonment";
  const parts: string[] = [];
  if (p.death) parts.push("death");
  if (p.life) parts.push("imprisonment for life");
  if (p.maxMonths !== null && !p.life && !p.death) {
    parts.push(
      p.minMonths !== null
        ? `imprisonment of ${formatMonths(p.minMonths)} to ${formatMonths(p.maxMonths)}`
        : `imprisonment up to ${formatMonths(p.maxMonths)}`
    );
  } else if (p.maxMonths !== null) {
    parts.push(`or imprisonment up to ${formatMonths(p.maxMonths)}`);
  }
  if (p.minMonths !== null && (p.life || p.death)) parts.push(`(minimum ${formatMonths(p.minMonths)})`);
  let s = parts.join(", ").replace(", or", " or");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (p.repeatMaxMonths !== null) s += `; up to ${formatMonths(p.repeatMaxMonths)} on a repeat conviction`;
  return s;
}

/**
 * Classifies an offence for BNSS §187(3).
 *  • death or life → 90 days (certain)
 *  • mandatory minimum ≥ 10 years → 90 days (certain under every reading)
 *  • maximum ≥ 10 years but lower minimum → disputed between 60 and 90
 *  • otherwise → 60 days
 */
export function classifyPeriod(p: PunishmentProfile, maxMonths: number | null): PeriodClass {
  if (p.death || p.life) return "NINETY";
  if (p.minMonths !== null && p.minMonths >= TEN_YEARS) return "NINETY";
  if (maxMonths !== null && maxMonths >= TEN_YEARS) return "DISPUTED";
  return "SIXTY";
}

function analyseOffence(raw: string, table: PunishmentTable, prior: TriState): OffenceAnalysis {
  const ref = parseSectionRef(raw);
  if (!ref) {
    return {
      input: raw,
      citation: raw,
      lookupStatus: "INVALID",
      effectiveMaxMonths: null,
      periodClass: "UNKNOWN",
      problem: `"${raw}" is not a BNS section number. Enter it as it appears on the FIR, e.g. 303(2) or 318(4).`,
    };
  }
  const found = lookupSection(table, ref);
  if (Number(ref.section) <= LAST_GENERAL_PROVISION) {
    return {
      input: raw,
      citation: found.citation,
      title: table.sections[ref.section]?.title,
      lookupStatus: found.status,
      effectiveMaxMonths: null,
      periodClass: "UNKNOWN",
      ignored: true,
      note: `${found.citation} is a general provision (e.g. common intention, definitions), not an offence with its own punishment. It does not change the dates.`,
    };
  }
  const base: OffenceAnalysis = {
    input: raw,
    citation: found.citation,
    title: found.title,
    lookupStatus: found.status,
    punishment: found.punishment,
    effectiveMaxMonths: null,
    periodClass: "UNKNOWN",
  };

  switch (found.status) {
    case "NOT_FOUND":
      return {
        ...base,
        problem: found.title
          ? `${found.citation} does not exist — §${ref.section} (${found.title}) has no sub-section (${ref.sub}). Check the FIR.`
          : `${found.citation} is not a section of the BNS (it has 358 sections). If the FIR uses old IPC numbers, convert them to BNS first.`,
      };
    case "NO_PUNISHMENT":
      return {
        ...base,
        problem: `${found.citation} (${found.title}) defines an offence or term but does not itself prescribe a punishment. Enter the section that punishes it (e.g. murder is defined in §101 but punished under §103).`,
      };
    case "UNRESOLVABLE":
      return {
        ...base,
        punishmentSummary: "Punishment depends on another offence",
        problem: `${found.citation} (${found.title}) is punished by reference to another offence (e.g. abetment, attempt, harbouring). Its maximum sentence cannot be read from this section alone, so dates that depend on it are not computed. A lawyer must work out the applicable maximum.`,
      };
    default: {
      const p = found.punishment!;
      const max = effectiveMax(p, prior);
      return {
        ...base,
        effectiveMaxMonths: max,
        punishmentSummary: summarisePunishment(p),
        periodClass: classifyPeriod(p, max),
      };
    }
  }
}

// ---------- Default bail (§187(3)) ----------

function computeDefaultBail(
  input: RightsClockInput,
  offences: OffenceAnalysis[],
  today: ISODate,
  warnings: string[]
): DefaultBailResult {
  const empty = (status: DefaultBailStatus, headline: string, explanation: string[]): DefaultBailResult => ({
    status,
    clockStartsOn: null,
    clockStartEstimated: false,
    periods: [],
    daysUntilEarliest: null,
    headline,
    explanation,
  });

  if (input.otherLawCharges) {
    return empty("NOT_COMPUTABLE", "Cannot be calculated — charges under another law", [
      "Special laws change the default-bail period (for example, NDPS and UAPA cases can allow up to 180 days). LegalSetu only computes BNS offences, so it will not show a date that could be wrong.",
      "Ask the Legal Services Authority (helpline 15100) to check the period for these charges.",
    ]);
  }

  const classes = offences.map((o) => o.periodClass);
  const hasNinety = classes.includes("NINETY");
  const hasDisputed = classes.includes("DISPUTED");
  const hasUnknown = classes.includes("UNKNOWN");

  let candidates: (60 | 90)[];
  let basis: Record<60 | 90, string>;
  if (hasNinety) {
    const o = offences.find((x) => x.periodClass === "NINETY")!;
    candidates = [90];
    basis = { 90: `${o.citation} is punishable with death, life imprisonment or a minimum of 10 years.`, 60: "" };
  } else if (hasDisputed || hasUnknown) {
    candidates = [60, 90];
    const d = offences.find((x) => x.periodClass === "DISPUTED");
    basis = {
      60: d
        ? `Reading that "ten years or more" means a minimum of 10 years: ${d.citation} has a maximum of ${formatMonths(d.effectiveMaxMonths!)} but no 10-year minimum, so 60 days.`
        : "If every charged section carries less than 10 years.",
      90: d
        ? `Reading that any offence whose maximum reaches 10 years counts: ${d.citation} attracts 90 days.`
        : "If a section that could not be classified carries 10 years or more.",
    };
    if (hasUnknown && !hasDisputed) {
      warnings.push(
        "At least one charged section could not be classified, so both the 60-day and 90-day dates are shown. Correct the section numbers to get a single date."
      );
    }
  } else {
    candidates = [60];
    basis = { 60: "Every charged section carries a maximum below 10 years and no death or life sentence.", 90: "" };
  }

  // Clock start: the first remand order. If absent, estimate as the day
  // after arrest (BNSS §58: production within 24 hours). The later
  // estimate is used deliberately so an estimated date is never too early.
  let start: ISODate;
  let estimated = false;
  if (input.firstRemandDate) {
    start = input.firstRemandDate;
  } else {
    start = addDays(input.arrestDate, 1);
    estimated = true;
  }

  const periods: DefaultBailPeriod[] = candidates.map((days) => ({
    days,
    lastDay: addDays(start, days - 1),
    rightArisesOn: addDays(start, days),
    basis: basis[days],
  }));
  const earliest = periods[0];
  const latest = periods[periods.length - 1];
  const disputed = periods.length > 1;

  const explanation: string[] = [
    `The count starts on ${formatDate(start)}${estimated ? " (estimated — the day after arrest)" : " (date of first remand)"}, and that day counts as day 1.`,
    ...periods.map(
      (p) => `${p.days}-day period: custody is authorised up to ${formatDate(p.lastDay)}; the right to default bail arises on ${formatDate(p.rightArisesOn)} if no chargesheet has been filed by then. ${p.basis}`
    ),
  ];
  if (estimated) {
    explanation.push("Enter the actual first remand date from the remand order to make these dates exact.");
  }

  const base = {
    clockStartsOn: start,
    clockStartEstimated: estimated,
    periods,
    daysUntilEarliest: daysBetween(today, earliest.rightArisesOn),
  };

  if (!input.inCustody) {
    return { ...base, status: "NOT_IN_CUSTODY", headline: "Not applicable — the person is not in custody", explanation };
  }

  const cs = input.chargesheetFiledOn ?? null;
  if (cs) {
    if (cs <= earliest.lastDay) {
      return {
        ...base,
        status: "CHARGESHEET_IN_TIME",
        headline: "Chargesheet filed in time — default bail is not available",
        explanation: [
          ...explanation,
          `The chargesheet was filed on ${formatDate(cs)}, within the permitted period. Regular bail can still be sought on the merits.`,
        ],
      };
    }
    if (disputed && cs <= latest.lastDay) {
      return {
        ...base,
        status: "CONTESTED",
        headline: "Contested — the chargesheet came between day 60 and day 90",
        explanation: [
          ...explanation,
          `The chargesheet was filed on ${formatDate(cs)}: late under the 60-day reading, in time under the 90-day reading. If a default bail application was filed before ${formatDate(cs)}, a lawyer should press it on the 60-day reading.`,
        ],
      };
    }
    return {
      ...base,
      status: "CHARGESHEET_LATE",
      headline: "The right arose — it survives only if bail was applied for before the chargesheet",
      explanation: [
        ...explanation,
        `The chargesheet was filed on ${formatDate(cs)}, after the right arose on ${formatDate(latest.rightArisesOn)}. If a default bail application was filed before that date, the court must decide it in the accused's favour (M. Ravindran, 2020). If not, the right is generally lost and regular bail must be sought.`,
      ],
    };
  }

  if (today >= latest.rightArisesOn) {
    return {
      ...base,
      status: "AVAILABLE_NOW",
      headline: "Default bail is available NOW — apply before the chargesheet is filed",
      explanation: [
        ...explanation,
        "No chargesheet is recorded. The right is lost if the police file the chargesheet before the application is made, so apply immediately.",
      ],
    };
  }
  if (disputed && today >= earliest.rightArisesOn) {
    return {
      ...base,
      status: "ARGUABLE_NOW",
      headline: "Default bail can be argued now (60-day reading); certain from " + formatDate(latest.rightArisesOn),
      explanation: [
        ...explanation,
        "Because the law is unsettled, a lawyer can apply now on the 60-day reading. An application made now also protects the right if the chargesheet is filed before day 90.",
      ],
    };
  }
  const days = daysBetween(today, earliest.rightArisesOn);
  return {
    ...base,
    status: "UPCOMING",
    headline: `Default bail ${disputed ? "may arise" : "arises"} on ${formatDate(earliest.rightArisesOn)} — in ${days} day${days === 1 ? "" : "s"}`,
    explanation: [
      ...explanation,
      "Ask the family lawyer or Legal Aid counsel to have an application ready on that date, and to check whether the chargesheet has been filed.",
    ],
  };
}

// ---------- Release after part-serving (§479) ----------

function computeSection479(
  input: RightsClockInput,
  offences: OffenceAnalysis[],
  today: ISODate,
  warnings: string[]
): Section479Result {
  const daysDetained = Math.max(0, daysBetween(input.arrestDate, today));
  const empty = (status: Section479Status, headline: string, explanation: string[]): Section479Result => ({
    status,
    governingCitation: null,
    maxMonths: null,
    daysDetained,
    oneThirdOn: null,
    oneHalfOn: null,
    applicableFraction: null,
    absoluteLimitOn: null,
    headline,
    explanation,
  });

  if (!input.inCustody) return empty("NOT_IN_CUSTODY", "Not applicable — the person is not in custody", []);

  const valid = offences.filter((o) => o.punishment && o.lookupStatus !== "UNRESOLVABLE");
  const deathOrLife = valid.find((o) => o.punishment!.death || o.punishment!.life);
  if (deathOrLife) {
    return {
      ...empty(
        "EXCLUDED_DEATH_OR_LIFE",
        "Not available — an offence charged carries death or life imprisonment",
        [
          `${deathOrLife.citation} (${deathOrLife.title}) is punishable with ${deathOrLife.punishment!.death ? "death" : "imprisonment for life"}. §479 expressly excludes such offences. Regular bail and default bail remain available.`,
        ]
      ),
      governingCitation: deathOrLife.citation,
    };
  }

  if (input.otherLawCharges) {
    return empty("NOT_COMPUTABLE", "Cannot be calculated — charges under another law", [
      "§479 applies to offences under any law, but LegalSetu only has punishment data for the BNS. The maximum sentence for the other charges must be checked by a lawyer.",
    ]);
  }

  const unresolved = offences.filter((o) => o.effectiveMaxMonths === null && !o.punishment?.nonCustodial);
  if (unresolved.length > 0 || valid.length === 0) {
    return empty("NOT_COMPUTABLE", "Cannot be calculated from the sections entered", [
      unresolved.length
        ? `The maximum sentence for ${unresolved.map((o) => o.citation).join(", ")} could not be determined (see the note on each section).`
        : "No charged section with a readable punishment was entered.",
    ]);
  }

  const imprisonable = valid.filter((o) => !o.punishment!.nonCustodial && o.effectiveMaxMonths !== null);
  if (imprisonable.length === 0) {
    return empty("NOT_IMPRISONABLE", "The offences charged are not punishable with imprisonment", [
      "None of the charged sections carries imprisonment. Continued custody for such an offence should be raised with a lawyer or the Legal Services Authority (15100) immediately.",
    ]);
  }

  // The governing offence is the one with the longest maximum — the
  // statute speaks of "the maximum period of imprisonment specified for
  // that offence", and using the gravest charge never produces a date
  // that is too early.
  const governing = [...imprisonable].sort((a, b) => b.effectiveMaxMonths! - a.effectiveMaxMonths!)[0];
  const maxMonths = governing.effectiveMaxMonths!;
  const maxEnd = addMonths(input.arrestDate, maxMonths);
  const totalDays = daysBetween(input.arrestDate, maxEnd);
  // Eligible on the day the required number of days has been fully served.
  const oneThirdOn = addDays(input.arrestDate, Math.ceil(totalDays / 3));
  const oneHalfOn = addDays(input.arrestDate, Math.ceil(totalDays / 2));
  const absoluteLimitOn = maxEnd;

  const applicableFraction =
    input.priorConviction === "NO" ? "ONE_THIRD" : input.priorConviction === "YES" ? "ONE_HALF" : null;
  const eligibleOn = applicableFraction === "ONE_THIRD" ? oneThirdOn : oneHalfOn;

  const explanation: string[] = [
    `Governing offence: ${governing.citation} (${governing.title}) — maximum ${formatMonths(maxMonths)}${
      input.priorConviction === "YES" && governing.punishment!.repeatMaxMonths !== null ? " (enhanced for a repeat conviction)" : ""
    }.`,
    `Detention counted from the arrest on ${formatDate(input.arrestDate)}: ${daysDetained} day${daysDetained === 1 ? "" : "s"} so far.`,
    `One-third of the maximum is completed on ${formatDate(oneThirdOn)} — release on bond for a first-time offender (never convicted of any offence).`,
    `One-half of the maximum is completed on ${formatDate(oneHalfOn)} — release on bail for everyone else.`,
    `On ${formatDate(absoluteLimitOn)} the full maximum sentence has been served; detention beyond that is illegal in every case.`,
    "The jail superintendent is required to apply to the court once the period is completed (§479(3)) — the family can and should remind them in writing.",
  ];
  if (input.priorConviction === "UNKNOWN") {
    warnings.push(
      "Whether the person has ever been convicted before decides between the one-third and one-half dates. Both are shown until this is answered."
    );
  }

  const result: Section479Result = {
    status: "UPCOMING",
    governingCitation: governing.citation,
    maxMonths,
    daysDetained,
    oneThirdOn,
    oneHalfOn,
    applicableFraction,
    absoluteLimitOn,
    headline: "",
    explanation,
  };

  if (today >= absoluteLimitOn) {
    return {
      ...result,
      status: "MAXIMUM_EXCEEDED",
      headline: `Detained longer than the maximum sentence since ${formatDate(absoluteLimitOn)} — this is illegal`,
      explanation: [
        ...explanation,
        "The third proviso to §479(1) applies even where multiple offences are pending. Contact a lawyer or the Legal Services Authority (15100) today.",
      ],
    };
  }

  const multipleOffences = new Set(offences.map((o) => o.citation)).size > 1;
  if (multipleOffences || input.otherPendingCases === "YES") {
    return {
      ...result,
      status: "BARRED_MULTIPLE",
      headline: "Likely barred by §479(2) — more than one offence or case is pending",
      explanation: [
        ...explanation,
        `§479(2) withholds this release where an investigation, inquiry or trial is pending for more than one offence${
          input.otherPendingCases === "YES" ? " or in multiple cases" : ""
        }. The dates above are shown for reference, and because how this bar applies to offences charged together in one FIR is still being argued in court, a lawyer should assess it.`,
      ],
    };
  }
  if (input.otherPendingCases === "UNKNOWN") {
    warnings.push("If any other case is pending against the person, §479(2) may bar this release. Confirm with the family or lawyer.");
  }

  const eligibleNow = applicableFraction === null ? today >= oneThirdOn : today >= eligibleOn;
  if (eligibleNow) {
    const certain = applicableFraction !== null || today >= oneHalfOn;
    return {
      ...result,
      status: "ELIGIBLE_NOW",
      headline: certain
        ? `Eligible for release under §479 since ${formatDate(applicableFraction === "ONE_THIRD" ? oneThirdOn : oneHalfOn)}`
        : `Eligible since ${formatDate(oneThirdOn)} IF never convicted before; otherwise from ${formatDate(oneHalfOn)}`,
    };
  }

  const target = applicableFraction === null ? oneThirdOn : eligibleOn;
  const days = daysBetween(today, target);
  return {
    ...result,
    status: "UPCOMING",
    headline:
      applicableFraction === null
        ? `Release under §479 from ${formatDate(oneThirdOn)} (first-time offender) or ${formatDate(oneHalfOn)}`
        : `Release under §479 from ${formatDate(eligibleOn)} — in ${days} day${days === 1 ? "" : "s"}`,
  };
}

// ---------- Input validation ----------

export function validateInput(input: RightsClockInput, today: ISODate): string[] {
  const errors: string[] = [];
  if (!isISODate(input.arrestDate)) errors.push("Enter a valid arrest date.");
  else if (input.arrestDate > today) errors.push("The arrest date cannot be in the future.");

  if (input.firstRemandDate) {
    if (!isISODate(input.firstRemandDate)) errors.push("Enter a valid first remand date.");
    else if (isISODate(input.arrestDate) && input.firstRemandDate < input.arrestDate)
      errors.push("The first remand date cannot be before the arrest date.");
    else if (input.firstRemandDate > today) errors.push("The first remand date cannot be in the future.");
  }
  if (input.chargesheetFiledOn) {
    if (!isISODate(input.chargesheetFiledOn)) errors.push("Enter a valid chargesheet date.");
    else if (input.chargesheetFiledOn > today) errors.push("The chargesheet date cannot be in the future.");
  }
  const sections = input.sections.map((s) => s.trim()).filter(Boolean);
  if (sections.length === 0 && !input.otherLawCharges) errors.push("Enter at least one BNS section from the FIR.");
  if (sections.length > 25) errors.push("Enter at most 25 sections.");
  return errors;
}

// ---------- Entry point ----------

export function computeRightsClock(
  rawInput: RightsClockInput,
  table: PunishmentTable,
  today: ISODate
): RightsClockResult {
  const input: RightsClockInput = {
    ...rawInput,
    sections: Array.from(new Set(rawInput.sections.map((s) => s.trim()).filter(Boolean))),
  };
  const warnings: string[] = [];
  const dataSource = { act: table.actName, source: table.source, sourceHash: table.sourceHash };

  const inputErrors = validateInput(input, today);
  if (inputErrors.length) {
    const blank = (headline: string) => ({ headline, explanation: [] });
    return {
      computedOn: today,
      inputErrors,
      offences: [],
      defaultBail: {
        status: "NOT_COMPUTABLE",
        clockStartsOn: null,
        clockStartEstimated: false,
        periods: [],
        daysUntilEarliest: null,
        ...blank("Fix the highlighted details to calculate"),
      },
      section479: {
        status: "NOT_COMPUTABLE",
        governingCitation: null,
        maxMonths: null,
        daysDetained: 0,
        oneThirdOn: null,
        oneHalfOn: null,
        applicableFraction: null,
        absoluteLimitOn: null,
        ...blank("Fix the highlighted details to calculate"),
      },
      milestones: [],
      nextAction: null,
      warnings,
      arrestRights: ARREST_RIGHTS,
      authorities: AUTHORITIES,
      dataSource,
    };
  }

  const allOffences = input.sections.map((s) => analyseOffence(s, table, input.priorConviction));
  // General provisions are reported but never counted.
  const offences = allOffences.filter((o) => !o.ignored);
  if (offences.length === 0 && !input.otherLawCharges) {
    inputErrors.push("Only general provisions were entered. Add the section that defines the offence and its punishment (e.g. 303(2), 318(4)).");
    return {
      ...computeRightsClock({ ...input, sections: [] }, table, today),
      inputErrors,
      offences: allOffences,
    };
  }

  if (offences.some((o) => o.lookupStatus === "SECTION_LEVEL")) {
    warnings.push(
      "Some sections were entered without a sub-section, so the gravest sub-section was used. Enter the exact sub-section from the FIR (e.g. 303(2)) for precise dates."
    );
  }
  if (input.priorConviction !== "YES" && offences.some((o) => o.punishment?.repeatMaxMonths != null)) {
    warnings.push(
      "A charged section carries a higher maximum on a repeat conviction. The ordinary maximum is used unless you say the person has been convicted before."
    );
  }
  if (input.firstRemandDate && daysBetween(input.arrestDate, input.firstRemandDate) > 2) {
    warnings.push(
      `The first remand is ${daysBetween(input.arrestDate, input.firstRemandDate)} days after the arrest. An arrested person must be produced before a magistrate within 24 hours (BNSS §58) — if they were held longer without production, tell the lawyer.`
    );
  }

  const defaultBail = computeDefaultBail(input, offences, today, warnings);
  const section479 = computeSection479(input, offences, today, warnings);

  // ---------- Milestones ----------
  const milestones: Milestone[] = [];
  const push = (key: string, date: ISODate | null, label: string, certainty: Milestone["certainty"]) => {
    if (date) milestones.push({ key, date, label, certainty, passed: date <= today });
  };
  push("ARREST", input.arrestDate, "Arrest", "CERTAIN");
  if (defaultBail.clockStartsOn) {
    push("REMAND", defaultBail.clockStartsOn, defaultBail.clockStartEstimated ? "First remand (estimated)" : "First remand", defaultBail.clockStartEstimated ? "CONDITIONAL" : "CERTAIN");
  }
  const dbLive = !["CHARGESHEET_IN_TIME", "NOT_IN_CUSTODY", "NOT_COMPUTABLE"].includes(defaultBail.status);
  if (dbLive) {
    const disputed = defaultBail.periods.length > 1;
    for (const p of defaultBail.periods) {
      push(
        `DEFAULT_BAIL_${p.days}`,
        p.rightArisesOn,
        `Default bail (${p.days}-day period)${disputed ? (p.days === 60 ? " — arguable" : " — certain") : ""}`,
        disputed && p.days === 60 ? "CONTESTED" : "CERTAIN"
      );
    }
  }
  if (input.chargesheetFiledOn) push("CHARGESHEET", input.chargesheetFiledOn, "Chargesheet filed", "CERTAIN");

  const s479Reference = section479.status === "BARRED_MULTIPLE";
  const s479Live = ["UPCOMING", "ELIGIBLE_NOW", "BARRED_MULTIPLE", "MAXIMUM_EXCEEDED"].includes(section479.status);
  if (s479Live) {
    if (section479.applicableFraction !== "ONE_HALF") {
      push(
        "S479_ONE_THIRD",
        section479.oneThirdOn,
        "§479: one-third served (first-time offender)",
        s479Reference ? "REFERENCE" : section479.applicableFraction === "ONE_THIRD" ? "CERTAIN" : "CONDITIONAL"
      );
    }
    if (section479.applicableFraction !== "ONE_THIRD") {
      push("S479_ONE_HALF", section479.oneHalfOn, "§479: one-half served", s479Reference ? "REFERENCE" : "CERTAIN");
    }
    push("MAX_SENTENCE", section479.absoluteLimitOn, "Maximum sentence served — detention illegal beyond this", "CERTAIN");
  }
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // ---------- Next action ----------
  let nextAction: RightsClockResult["nextAction"] = null;
  if (input.inCustody) {
    if (section479.status === "MAXIMUM_EXCEEDED") {
      nextAction = { text: "Detention exceeds the maximum sentence — contact a lawyer / Legal Aid (15100) today", due: today, urgent: true };
    } else if (defaultBail.status === "AVAILABLE_NOW" || defaultBail.status === "ARGUABLE_NOW") {
      nextAction = { text: "File a default bail application (BNSS §187(3)) before the chargesheet is filed", due: today, urgent: true };
    } else if (section479.status === "ELIGIBLE_NOW") {
      nextAction = { text: "Apply for release under BNSS §479 and write to the jail superintendent", due: today, urgent: true };
    } else {
      const upcoming = milestones.find(
        (m) => !m.passed && (m.key.startsWith("DEFAULT_BAIL") || (m.key.startsWith("S479") && m.certainty !== "REFERENCE"))
      );
      if (upcoming) {
        nextAction = {
          text: upcoming.key.startsWith("DEFAULT_BAIL")
            ? `Prepare a default bail application — the right ${upcoming.certainty === "CONTESTED" ? "may arise" : "arises"} on ${formatDate(upcoming.date)}`
            : `Prepare a §479 release application for ${formatDate(upcoming.date)}`,
          due: upcoming.date,
          urgent: daysBetween(today, upcoming.date) <= 7,
        };
      } else {
        nextAction = { text: "Seek regular bail through a lawyer or the Legal Services Authority (15100)", due: null, urgent: false };
      }
    }
  }

  return {
    computedOn: today,
    inputErrors: [],
    offences: allOffences,
    defaultBail,
    section479,
    milestones,
    nextAction,
    warnings,
    arrestRights: ARREST_RIGHTS,
    authorities: AUTHORITIES,
    dataSource,
  };
}
