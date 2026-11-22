// ==========================================================
// LegalSetu — Rights Clock: application drafts
// ----------------------------------------------------------
// Deterministic templates — no language model is involved.
// Every fact in a draft comes either from what the family
// entered or from the engine's computation; anything unknown is
// left as a visible blank ("[Name of court]") for the lawyer or
// family to fill, never guessed. This is the same rule the FIR
// draft generator follows: a fabricated date or FIR number on a
// court filing is worse than a blank.
// ==========================================================

import type { ComplaintDocument } from "@/lib/fir/pdf";
import { formatDate, formatMonths } from "./dates";
import type { RightsClockInput, RightsClockResult } from "./engine";

export type ApplicationKind = "default-bail" | "section-479" | "jail-letter";

export interface ApplicationParty {
  personName: string;
  relationship?: string | null;
  policeStation?: string | null;
  firNumber?: string | null;
  courtName?: string | null;
  prisonName?: string | null;
}

export class ApplicationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationUnavailableError";
  }
}

const blank = (value: string | null | undefined, label: string) => (value && value.trim() ? value.trim() : `[${label}]`);

const FOOTER = "LegalSetu draft — not legal advice. Review with a lawyer or Legal Aid counsel before filing.";
const PREPARED = "Draft prepared by LegalSetu Rights Clock from details entered by the family. Verify every fact before filing.";

function sectionsLine(input: RightsClockInput, result: RightsClockResult): string {
  const counted = result.offences.filter((o) => !o.ignored).map((o) => o.citation.replace("BNS §", ""));
  const all = input.sections.length ? input.sections.join(", ") : counted.join(", ");
  return `Section(s) ${all || "[sections]"} of the Bharatiya Nyaya Sanhita, 2023${input.otherLawCharges ? " and [other enactments]" : ""}`;
}

function signature(party: ApplicationParty): string {
  return party.relationship
    ? `${party.personName} (through ${party.relationship.toLowerCase()} / counsel)`
    : `${party.personName} (Applicant / through counsel)`;
}

export function canDraft(kind: ApplicationKind, result: RightsClockResult): { ok: boolean; reason?: string } {
  if (result.inputErrors.length) return { ok: false, reason: "Fix the details on the tracker first." };
  if (kind === "default-bail") {
    const ok = ["UPCOMING", "ARGUABLE_NOW", "AVAILABLE_NOW", "CONTESTED", "CHARGESHEET_LATE"].includes(result.defaultBail.status);
    return ok ? { ok } : { ok, reason: `A default bail application does not fit this situation: ${result.defaultBail.headline}.` };
  }
  const ok = ["UPCOMING", "ELIGIBLE_NOW", "MAXIMUM_EXCEEDED"].includes(result.section479.status);
  return ok ? { ok } : { ok, reason: `A §479 application does not fit this situation: ${result.section479.headline}.` };
}

export function buildApplication(
  kind: ApplicationKind,
  party: ApplicationParty,
  input: RightsClockInput,
  result: RightsClockResult
): ComplaintDocument {
  const check = canDraft(kind, result);
  if (!check.ok) throw new ApplicationUnavailableError(check.reason!);

  const name = party.personName;
  const fir = blank(party.firNumber, "FIR number");
  const ps = blank(party.policeStation, "Police station");
  const court = blank(party.courtName, "Name of court");
  const prison = blank(party.prisonName, "Name of prison");
  const today = formatDate(result.computedOn);
  const charges = sectionsLine(input, result);
  const arrested = formatDate(input.arrestDate);

  if (kind === "default-bail") {
    const db = result.defaultBail;
    const remand = input.firstRemandDate ? formatDate(input.firstRemandDate) : "[date of first remand — see remand order]";
    const certain = db.periods[db.periods.length - 1];
    const earliest = db.periods[0];
    const disputed = db.periods.length > 1;
    const grounds: string[] = [
      `1. Section 187(3) of the Bharatiya Nagarik Suraksha Sanhita, 2023 ("BNSS") does not permit detention of an accused during investigation for a total period exceeding ninety days where the investigation relates to an offence punishable with death, imprisonment for life or imprisonment for a term of ten years or more, and sixty days in any other case. On expiry of that period the accused "shall be released on bail" if prepared to and does furnish bail.`,
      `2. The Applicant was first remanded to custody on ${remand}. Under Enforcement Directorate v. Kapil Wadhawan, 2023 INSC 723, the date of remand is included in computing the period. ${
        input.firstRemandDate
          ? `The ${earliest.days}-day period therefore expired on ${formatDate(earliest.lastDay)}${disputed ? `, and the ${certain.days}-day period on ${formatDate(certain.lastDay)}` : ""}.`
          : "[State the date on which the period expired.]"
      }`,
    ];
    if (disputed) {
      grounds.push(
        `3. The offence(s) alleged carry a maximum term that may extend to ten years but no minimum of ten years. "Imprisonment for a term of ten years or more" refers to offences carrying a minimum of ten years; the applicable period is therefore sixty days. Without prejudice, even the ninety-day period has expired / will expire on ${formatDate(certain.lastDay)}.`
      );
    }
    grounds.push(
      `${grounds.length + 1}. To the Applicant's knowledge no chargesheet / final report under Section 193 BNSS has been filed as on the date of this application. The Applicant's indefeasible right to be released on default bail has accrued and is being exercised by this application, before any such filing (M. Ravindran v. Intelligence Officer, DRI, 2020).`,
      `${grounds.length + 2}. The Applicant is ready and willing to furnish bail and surety to the satisfaction of this Hon'ble Court and undertakes to abide by all conditions that may be imposed.`
    );

    return {
      title: "Application for Default Bail — DRAFT",
      addressee: ["To,", "The Hon'ble Court of", court],
      subject: `Application under Section 187(3) BNSS for release on default (statutory) bail — ${name}, FIR No. ${fir}, P.S. ${ps}`,
      salutation: "Respectfully Sheweth,",
      opening: `The Applicant, ${name}, was arrested on ${arrested} in connection with FIR No. ${fir} registered at Police Station ${ps} under ${charges}, and is presently in judicial custody.`,
      sections: [
        { heading: "GROUNDS", body: grounds },
        {
          heading: "PRAYER",
          body: [
            "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to release the Applicant on default bail under Section 187(3) BNSS on such terms and conditions as this Hon'ble Court deems fit, and to pass any other order in the interest of justice.",
          ],
        },
      ],
      declaration: `I, ${name}, the Applicant above named, state that the facts stated above are true to my knowledge and belief and that nothing material has been concealed.`,
      place: party.courtName ? undefined : "[Place]",
      date: today,
      signatureName: signature(party),
      footerNote: FOOTER,
      preparedNote: PREPARED,
    };
  }

  const s = result.section479;
  const max = s.maxMonths !== null ? formatMonths(s.maxMonths) : "[maximum term]";
  const firstTime = input.priorConviction === "NO";
  const eligibleOn = firstTime ? s.oneThirdOn : s.oneHalfOn;
  const fractionText = firstTime ? "one-third" : "one-half";
  const governing = s.governingCitation ?? "[governing section]";
  const exceeded = s.status === "MAXIMUM_EXCEEDED";

  const factLines = [
    `The Applicant, ${name}, was arrested on ${arrested} in connection with FIR No. ${fir}, P.S. ${ps}, under ${charges}, and has remained in custody since, i.e. for ${s.daysDetained} days as on ${today}.`,
    `The gravest offence alleged, ${governing}, is punishable with imprisonment which may extend to ${max}. No offence alleged is punishable with death or imprisonment for life.`,
    exceeded
      ? `The Applicant has already been detained for longer than the maximum period of ${max}, which expired on ${formatDate(s.absoluteLimitOn!)}.`
      : `${fractionText.charAt(0).toUpperCase() + fractionText.slice(1)} of that maximum period ${
          eligibleOn && eligibleOn <= result.computedOn ? "was completed" : "is completed"
        } on ${eligibleOn ? formatDate(eligibleOn) : "[date]"}.`,
  ];
  if (firstTime) factLines.push("The Applicant has never been convicted of any offence and is a first-time offender.");
  if (input.priorConviction === "UNKNOWN") {
    factLines.push("[State whether the Applicant has ever been convicted of any offence. If never convicted, the one-third period applies.]");
  }
  factLines.push(
    input.otherPendingCases === "NO"
      ? "No other investigation, inquiry or trial is pending against the Applicant."
      : "[Confirm that no other investigation, inquiry or trial is pending against the Applicant — see Section 479(2) BNSS.]"
  );

  if (kind === "jail-letter") {
    return {
      title: "Request to Jail Superintendent under Section 479(3) BNSS — DRAFT",
      addressee: ["To,", "The Superintendent,", prison],
      subject: `Request to apply for release of undertrial prisoner ${name} under Section 479 BNSS`,
      salutation: "Sir / Madam,",
      opening: `I write on behalf of undertrial prisoner ${name}, lodged in ${prison}.`,
      sections: [
        { heading: "FACTS", body: factLines },
        {
          heading: "REQUEST",
          body: [
            `Section 479(3) BNSS requires the Superintendent of the jail, where an accused person is detained, to make an application in writing to the Court for release of the prisoner on completion of ${firstTime ? "one-third" : "one-half"} of the maximum period of imprisonment (or the full period). The Supreme Court in In Re: Inhuman Conditions in 1382 Prisons (August 2024) directed that this provision be applied to all eligible undertrials.`,
            `I therefore request you to make the application under Section 479(3) BNSS to the Court of ${court} for the release of ${name} without delay, and to inform the family of the date of filing.`,
          ],
        },
      ],
      declaration: "The facts stated above are true to the best of my knowledge and belief.",
      place: "[Place]",
      date: today,
      signatureName: party.relationship ? `[Name of sender], ${party.relationship} of ${name}` : `[Name of sender], on behalf of ${name}`,
      footerNote: FOOTER,
      preparedNote: PREPARED,
    };
  }

  return {
    title: "Application for Release under Section 479 BNSS — DRAFT",
    addressee: ["To,", "The Hon'ble Court of", court],
    subject: `Application under Section 479 BNSS for release of undertrial ${name} — FIR No. ${fir}, P.S. ${ps}`,
    salutation: "Respectfully Sheweth,",
    opening: "The Applicant most respectfully submits as under:",
    sections: [
      { heading: "FACTS", body: factLines },
      {
        heading: "GROUNDS",
        body: [
          "1. Under Section 479(1) BNSS, a person who has undergone detention during investigation, inquiry or trial for a period extending up to one-half of the maximum period of imprisonment specified for the offence shall be released by the Court on bail; under its first proviso, a first-time offender shall be released on bond on completion of one-third of that period.",
          "2. Under the third proviso to Section 479(1), no person shall be detained during investigation, inquiry or trial for more than the maximum period of imprisonment provided for the offence.",
          "3. The Supreme Court in In Re: Inhuman Conditions in 1382 Prisons (August 2024) directed that Section 479 apply to undertrials irrespective of whether the case was registered before 1 July 2024.",
          `4. The Applicant ${exceeded ? "has been detained beyond the maximum period" : `has completed ${fractionText} of the maximum period`} and is entitled to be released.`,
        ],
      },
      {
        heading: "PRAYER",
        body: [
          `It is therefore most respectfully prayed that this Hon'ble Court may be pleased to release the Applicant on ${firstTime ? "bond" : "bail"} under Section 479 BNSS, and to pass any other order in the interest of justice.`,
        ],
      },
    ],
    declaration: `I, ${name}, the Applicant above named, state that the facts stated above are true to my knowledge and belief and that nothing material has been concealed.`,
    place: "[Place]",
    date: today,
    signatureName: signature(party),
    footerNote: FOOTER,
    preparedNote: PREPARED,
  };
}
