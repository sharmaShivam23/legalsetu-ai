// ==========================================================
// LegalSetu — FIR Assistant: statutory context (retrieved, not guessed)
// ----------------------------------------------------------
// The previous implementation carried a hardcoded table:
//
//   Theft            -> BNS 303
//   Cybercrime/Fraud -> BNS 318
//   Physical Assault -> BNS 115
//   Extortion        -> BNS 308
//
// and printed those numbers onto a document a citizen would hand
// to a police station. Two things were wrong with that. The
// numbers were asserted from a constant with nothing verifying
// them, bypassing the corpus and citation guard the rest of the
// app relies on. And a single dropdown value cannot determine an
// offence — the same "theft" label covers snatching, burglary and
// breach of trust, which are different provisions entirely.
//
// This replaces it with retrieval from the verified corpus, and
// nothing reaches a draft that did not come back from that search.
// Even then it is presented as context for the complainant, never
// as the section that applies: that is the police's call, and
// saying otherwise on a complaint form is a real-world harm.
// ==========================================================

import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { logger } from "@/lib/logging/logger";
import type { FIRCaseState, LegalContextEntry } from "./case-state";
import { getFact } from "./case-state";

/** Only sections this similar are worth showing to a complainant. */
const MIN_RELEVANCE = 0.45;
const MAX_ENTRIES = 4;

/**
 * Builds the search text from the complainant's own account rather
 * than from a category label, so retrieval sees "phone snatched from
 * my hand on the street" instead of the word "theft".
 */
function buildSearchText(state: FIRCaseState): string {
  const parts = [
    getFact(state, "incidentType")?.value,
    getFact(state, "whatHappened")?.value,
    getFact(state, "propertyInvolved")?.value,
    getFact(state, "threats")?.value,
    getFact(state, "injuries")?.value,
    getFact(state, "financialLoss")?.value,
  ].filter(Boolean);

  return parts.join(". ").slice(0, 1500);
}

/**
 * Retrieves provisions that MAY be relevant to the account given.
 * Returns an empty list rather than a guess when nothing sufficiently
 * relevant is found — an empty "legal context" section is honest; a
 * plausible-looking wrong section is not.
 */
export async function retrieveLegalContext(
  state: FIRCaseState
): Promise<LegalContextEntry[]> {
  const query = buildSearchText(state);
  if (query.trim().length < 10) return [];

  try {
    const { chunks } = await retrieveRelevantChunks(query);

    const entries: LegalContextEntry[] = [];
    const seen = new Set<string>();

    for (const chunk of chunks) {
      if (chunk.similarity < MIN_RELEVANCE) continue;
      // Without a section number there is nothing citable.
      if (!chunk.section) continue;

      const key = `${chunk.sourceTitle}#${chunk.section}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entries.push({
        act: chunk.actName ?? chunk.sourceTitle,
        section: chunk.section,
        // First sentence of the official text, so the complainant sees
        // what the provision actually says rather than our paraphrase.
        summary: chunk.text.replace(/\s+/g, " ").trim().slice(0, 240),
        sourceTitle: chunk.sourceTitle,
        officialUrl: chunk.officialUrl ?? undefined,
      });

      if (entries.length >= MAX_ENTRIES) break;
    }

    return entries;
  } catch (err) {
    // Retrieval being unavailable must never block a complaint. The
    // draft simply carries no statutory context, which is a valid and
    // complete police complaint on its own.
    logger.warn("FIR legal context retrieval failed", {
      errorType: String(err).slice(0, 200),
    });
    return [];
  }
}

/**
 * Wording used wherever statutory context is shown. Kept in one place
 * so the framing cannot drift between the UI and the PDF.
 */
export const LEGAL_CONTEXT_DISCLAIMER =
  "These provisions are shown for your information only, retrieved from LegalSetu's verified library of Indian legislation. They are not a legal opinion and do not determine what will be registered. The police authority decides which offences and sections apply.";
