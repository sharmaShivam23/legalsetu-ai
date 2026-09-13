// ==========================================================
// LegalSetu — FIR Assistant: complaint draft assembly
// ----------------------------------------------------------
// Builds the complaint from the confirmed case state. The
// structure is assembled in code, not by the model, and the model
// is used for exactly one narrow job: turning the complainant's
// own account into an orderly chronological narrative.
//
// That split is deliberate. Headings, names, dates, amounts and
// the declaration are copied verbatim from recorded facts, so
// they cannot drift. Only the prose passes through a model, and
// even that is checked afterwards by lib/fir/draft-validator.ts.
//
// Every phrase is attributive — "the complainant states that" —
// because this document reports allegations, not findings.
// ==========================================================

// Same reasoning as the investigator: llm.ts carries key rotation and
// the cross-provider fallback.
import { generateCompletion } from "@/lib/ai/llm";
import { logger } from "@/lib/logging/logger";
import { languageName, normalizeLanguage } from "@/lib/i18n/languages";
import type { ComplaintDocument, ComplaintSection } from "./pdf";
import type { FIRCaseState } from "./case-state";
import { getFact } from "./case-state";
import { LEGAL_CONTEXT_DISCLAIMER } from "./legal-context";
import { stripUnsupportedStatutes, validateDraft, type DraftIssue } from "./draft-validator";

export const COMPLAINT_TITLE = "Police Complaint / FIR Draft";

export const DRAFT_DISCLAIMER =
  "This document is a draft prepared from the information provided by the complainant. It is not an official First Information Report. The police authority determines whether an FIR is registered and which legal provisions apply.";

function formatDate(date = new Date()): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Resolved value wins over the raw fact — the user settled that conflict. */
function valueFor(state: FIRCaseState, key: Parameters<typeof getFact>[1]): string | undefined {
  const resolved = state.contradictions.find(
    (c) => c.key === key && c.resolvedValue
  )?.resolvedValue;
  return resolved ?? getFact(state, key)?.value;
}

/**
 * Asks the model to order the complainant's account chronologically.
 * It is given ONLY the recorded facts, and told it may not add to them.
 */
async function buildNarrative(state: FIRCaseState): Promise<string> {
  const target = languageName(normalizeLanguage(state.language));
  const facts = state.facts
    .map((f) => `- ${f.key}: ${f.value}`)
    .join("\n");
  const timeline = state.timeline
    .map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ""}: ${e.description}`)
    .join("\n");

  const prompt = `Write the factual narrative section of a police complaint in India, in ${target}.

RECORDED FACTS (the complete and only permitted source of content):
${facts || "(none)"}

TIMELINE:
${timeline || "(none recorded)"}

RULES — these are absolute:
- Use ONLY the facts above. Do NOT add a date, name, amount, place, witness, injury or event that does not appear there. If something is unknown, leave it out rather than filling it in.
- Write in the first person as the complainant ("I", "my"), in plain formal prose.
- Present events in chronological order, in short paragraphs.
- Describe allegations as allegations. Write "the person who approached me" rather than asserting guilt.
- Do NOT mention any Act, section number, or offence classification. None. That is decided by the police.
- Do NOT add a heading, a salutation, a declaration or a signature — those are added separately.
- Do NOT add commentary, advice, or anything about what should happen next.
- No emotional or dramatic language. Factual and calm.

Return only the narrative prose.`;

  try {
    const text = await generateCompletion(
      [
        {
          role: "system",
          content:
            "You draft factual sections of Indian police complaints. You never introduce facts that were not given to you.",
        },
        { role: "user", content: prompt },
      ],
      // 1200 was too tight for this model: it spends tokens on internal
      // "thinking" out of the same budget before writing anything, and
      // that overhead scales with the cap rather than being fixed.
      // Verified empirically — at 1200 it used 1098 tokens thinking and
      // the complaint was cut off mid-sentence with MAX_TOKENS on every
      // draft. 4000 (matching case mode's report budget, since a
      // complaint is a comparably long-form document) finishes cleanly.
      { temperature: 0.1, maxTokens: 4000 }
    );
    return text.trim();
  } catch (err) {
    logger.warn("Narrative generation failed; falling back to the account as given", {
      errorType: String(err).slice(0, 200),
    });
    // Falling back to the complainant's own words is always safe: it is
    // their statement, unaltered.
    return valueFor(state, "whatHappened") ?? "";
  }
}

export interface GeneratedDraft {
  document: ComplaintDocument;
  /** Flattened text, used for validation and on-screen review. */
  plainText: string;
  issues: DraftIssue[];
  /** True when nothing unsupported survived into the final text. */
  validated: boolean;
}

export async function generateComplaintDraft(
  state: FIRCaseState,
  complainantFallbackName?: string
): Promise<GeneratedDraft> {
  const narrativeRaw = await buildNarrative(state);
  // Any statute the narrative smuggled in is removed before validation:
  // the complaint stands on its facts, and an unverified section is the
  // one thing safe to drop outright.
  const narrative = stripUnsupportedStatutes(narrativeRaw, state);

  const complainantName =
    valueFor(state, "complainantName") ?? complainantFallbackName ?? "[Complainant name]";
  const incidentType = valueFor(state, "incidentType") ?? "the incident described below";
  const station = valueFor(state, "jurisdictionArea") ?? valueFor(state, "incidentLocation");

  const sections: ComplaintSection[] = [];

  // 1 — Complainant
  const complainantLines = [`Name: ${complainantName}`];
  const contact = valueFor(state, "complainantContact");
  const address = valueFor(state, "complainantAddress");
  if (address) complainantLines.push(`Address: ${address}`);
  if (contact) complainantLines.push(`Contact: ${contact}`);
  sections.push({ heading: "1. COMPLAINANT DETAILS", body: complainantLines });

  // 2 — Incident particulars
  const incidentLines: string[] = [];
  const date = valueFor(state, "incidentDate");
  const time = valueFor(state, "incidentTime");
  const location = valueFor(state, "incidentLocation");
  incidentLines.push(`Date: ${date ?? "Not known"}`);
  incidentLines.push(`Time: ${time ?? "Not known"}`);
  incidentLines.push(`Place: ${location ?? "Not known"}`);
  incidentLines.push(`Nature of incident: ${incidentType}`);
  sections.push({ heading: "2. INCIDENT DETAILS", body: incidentLines });

  // 3 — Narrative
  if (narrative.trim()) {
    sections.push({
      heading: "3. DESCRIPTION OF THE INCIDENT",
      body: narrative.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    });
  }

  // 4 — Person(s) involved, only when the user actually named or described one
  const accusedName = valueFor(state, "accusedName");
  const accusedDescription = valueFor(state, "accusedDescription");
  if (accusedName || accusedDescription) {
    const lines: string[] = [];
    if (accusedName) lines.push(`The complainant states the person involved is: ${accusedName}`);
    if (accusedDescription) lines.push(`Description as given by the complainant: ${accusedDescription}`);
    sections.push({ heading: "4. PERSON(S) INVOLVED", body: lines });
  } else {
    sections.push({
      heading: "4. PERSON(S) INVOLVED",
      body: ["The complainant is not able to identify the person(s) involved."],
    });
  }

  // 5 — Loss, damage or injury
  const lossLines: string[] = [];
  const property = valueFor(state, "propertyInvolved");
  const loss = valueFor(state, "financialLoss");
  const injuries = valueFor(state, "injuries");
  if (property) lossLines.push(`Property involved: ${property}`);
  if (loss) lossLines.push(`Financial loss stated: ${loss}`);
  if (injuries) lossLines.push(`Injuries stated: ${injuries}`);
  if (lossLines.length) {
    sections.push({ heading: "5. LOSS / DAMAGE / INJURY", body: lossLines });
  }

  // 6 — Evidence
  const evidence = valueFor(state, "evidence");
  const witnesses = valueFor(state, "witnesses");
  if (evidence || witnesses) {
    const lines: string[] = [];
    if (evidence) lines.push(`Supporting material available: ${evidence}`);
    if (witnesses) lines.push(`Witnesses: ${witnesses}`);
    sections.push({ heading: "6. EVIDENCE / SUPPORTING MATERIAL", body: lines });
  }

  // 7 — Steps already taken
  const taken = valueFor(state, "actionsAlreadyTaken");
  const policeContact = valueFor(state, "policeContact");
  const previous = valueFor(state, "previousComplaint");
  if (taken || policeContact || previous) {
    const lines: string[] = [];
    if (taken) lines.push(taken);
    if (policeContact) lines.push(`Contact with police: ${policeContact}`);
    if (previous) lines.push(`Previous complaint: ${previous}`);
    sections.push({ heading: "7. ACTIONS ALREADY TAKEN", body: lines });
  }

  // 8 — Request
  const requested = valueFor(state, "requestedAction");
  sections.push({
    heading: "8. REQUEST",
    body: [
      requested
        ? `The complainant respectfully requests: ${requested}`
        : "The complainant respectfully requests that this complaint be examined and that appropriate action be taken in accordance with applicable law.",
    ],
  });

  // 9 — Statutory context, only when retrieval actually returned something
  if (state.legalContext.length > 0) {
    sections.push({
      heading: "9. STATUTORY CONTEXT (FOR INFORMATION ONLY)",
      body: [
        LEGAL_CONTEXT_DISCLAIMER,
        ...state.legalContext.map(
          (e) => `${e.act}, Section ${e.section} — ${e.summary}`
        ),
      ],
    });
  }

  const document: ComplaintDocument = {
    title: COMPLAINT_TITLE,
    addressee: [
      "To,",
      "The Station House Officer / Officer In Charge",
      station ? `${station}` : "[Police Station]",
    ],
    subject: `Complaint regarding ${incidentType}`,
    salutation: "Respected Sir/Madam,",
    opening: `I, ${complainantName}, respectfully submit this complaint regarding the following incident.`,
    sections,
    declaration:
      "I state that the information provided above is true to the best of my knowledge and belief.",
    place: location ?? undefined,
    date: formatDate(),
    signatureName: complainantName,
    footerNote: "LegalSetu assistance document — not an official FIR.",
  };

  const plainText = [
    document.subject,
    document.opening,
    ...sections.flatMap((s) => [s.heading, ...s.body]),
    document.declaration,
  ].join("\n");

  const validation = validateDraft(plainText, state);
  if (!validation.ok) {
    logger.warn("FIR draft contained unsupported content", {
      issueCount: validation.issues.length,
      types: validation.issues.map((i) => i.type),
    });
  }

  return {
    document,
    plainText,
    issues: validation.issues,
    validated: validation.ok,
  };
}
