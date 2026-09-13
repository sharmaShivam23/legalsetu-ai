// ==========================================================
// LegalSetu — Case-mode marker protocol
// ----------------------------------------------------------
// In "case" mode the model must begin its reply with @@ASK@@
// or @@REPORT@@ (see lib/rag/prompt.ts) so the server can tell,
// from the very first tokens, whether it is looking at a
// clarifying question or the final report — before it has to
// decide things like "run the citation audit" or "what kind of
// card the client should render".
//
// Kept as a small pure module (no I/O) so the buffering logic
// used while a live stream is arriving can be unit tested
// without spinning up a server.
// ==========================================================

import { ASK_MARKER, REPORT_MARKER } from "./prompt";

export type MessageKind = "question" | "report";

/** Longest marker, plus a little slack for a leading newline/space. */
const MAX_MARKER_PROBE_LENGTH = Math.max(ASK_MARKER.length, REPORT_MARKER.length) + 4;

export interface MarkerParseResult {
  /** Set once enough text has arrived to make a determination. */
  kind: MessageKind | null;
  /** Everything after the marker line, ready to display/stream. */
  rest: string;
  /** True once a decision (marker found or given up) has been made. */
  resolved: boolean;
}

/**
 * Call this as buffered text grows. Returns as soon as a marker is
 * recognised, or once enough characters have arrived that we can be
 * sure the model did not emit one at all (defaults to "report" then
 * — showing the whole answer is always safer than hiding it).
 */
export function parseLeadingMarker(buffer: string): MarkerParseResult {
  const trimmedStart = buffer.replace(/^\s+/, "");

  if (trimmedStart.startsWith(ASK_MARKER)) {
    return {
      kind: "question",
      rest: trimmedStart.slice(ASK_MARKER.length).replace(/^\s*\n/, ""),
      resolved: true,
    };
  }

  if (trimmedStart.startsWith(REPORT_MARKER)) {
    return {
      kind: "report",
      rest: trimmedStart.slice(REPORT_MARKER.length).replace(/^\s*\n/, ""),
      resolved: true,
    };
  }

  // Enough characters have arrived that this cannot still turn into a
  // recognised marker — stop waiting and show everything received.
  if (trimmedStart.length >= MAX_MARKER_PROBE_LENGTH) {
    return { kind: "report", rest: buffer, resolved: true };
  }

  // Still ambiguous — could be the start of either marker. Caller
  // should hold rendering and wait for more text.
  return { kind: null, rest: "", resolved: false };
}
