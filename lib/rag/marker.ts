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

/**
 * Chat-template control tokens some open models leak into their visible
 * text — gpt-oss on Groq emits "<|message|>" and "<|channel|>final". They
 * are never content, so they are removed wherever they appear.
 */
const CONTROL_TOKEN = /<\|[a-z_]{1,24}\|>(?:final|analysis|commentary)?/gi;

/**
 * Words the model has actually written in place of ASK / REPORT. Asked to
 * reply "entirely in Hindi", it translated or transliterated the marker
 * ("@@Ask", "@@आस्क"), the exact-match check failed, and the raw marker
 * was shown to the user at the start of every reply.
 */
const ASK_WORDS = [
  "ask", "question", "आस्क", "पूछ", "प्रश्न", "सवाल", "ஆஸ்க்", "கேள்", "আস্ক", "প্রশ্ন",
  "ఆస్క్", "ప్రశ్న", "ಆಸ್ಕ್", "ಪ್ರಶ್ನೆ", "ആസ്ക്", "ചോദ്യ", "આસ્ક", "પ્રશ્ન", "ਆਸਕ", "ਸਵਾਲ", "ଆସ୍କ", "ପ୍ରଶ୍ନ",
];
const REPORT_WORDS = [
  "report", "रिपोर्ट", "ரிப்போர்ட்", "অহবাল", "রিপোর্ট", "రిపోర్ట్", "ರಿಪೋರ್ಟ್", "റിപ്പോർട്ട്",
  "રિપોર્ટ", "ਰਿਪੋਰਟ", "ରିପୋର୍ଟ", "प्रतिवेदन",
];

/** Removes leaked control tokens from model text. */
export function stripControlTokens(text: string): string {
  return text.replace(CONTROL_TOKEN, "");
}

/**
 * Removes a leading control marker in ANY of the forms models produce,
 * plus leaked control tokens. Used on text already saved to the database
 * (older replies were stored with the marker still in them) and on the
 * history sent back to the model, which otherwise copies the bad pattern.
 */
export function stripLeadingMarker(text: string): string {
  const parsed = parseLeadingMarker(text);
  return stripControlTokens(parsed.resolved ? parsed.rest : text);
}

export interface MarkerParseResult {
  /** Set once enough text has arrived to make a determination. */
  kind: MessageKind | null;
  /** Everything after the marker line, ready to display/stream. */
  rest: string;
  /** True once a decision (marker found or given up) has been made. */
  resolved: boolean;
}

function classify(word: string): MessageKind {
  const w = word.toLowerCase();
  if (REPORT_WORDS.some((r) => w.startsWith(r))) return "report";
  if (ASK_WORDS.some((a) => w.startsWith(a))) return "question";
  // An unrecognised word still IS a marker and must not be shown. Report
  // is the safe reading: the whole reply is displayed and audited.
  return "report";
}

/**
 * Call this as buffered text grows. Returns as soon as a marker is
 * recognised, or once enough characters have arrived that we can be
 * sure the model did not emit one at all (defaults to "report" then
 * — showing the whole answer is always safer than hiding it).
 *
 * Accepts the exact protocol (@@ASK@@ / @@REPORT@@) and the variants
 * models really produce: any letter case, the word in an Indian script,
 * a missing closing "@@", and control tokens before or after the marker.
 */
export function parseLeadingMarker(buffer: string): MarkerParseResult {
  let text = buffer.replace(/^\s+/, "");

  // Leaked control tokens ahead of the marker. A token still arriving
  // ("<|mess") is held until it is complete.
  while (true) {
    const lead = text.match(/^<\|[a-z_]{1,24}\|>(?:final|analysis|commentary)?\s*/i);
    if (lead) {
      text = text.slice(lead[0].length);
      continue;
    }
    if (/^<\|?[a-z_]{0,24}\|?$/i.test(text)) return { kind: null, rest: "", resolved: false };
    break;
  }

  if (text === "@") return { kind: null, rest: "", resolved: false };

  if (text.startsWith("@@")) {
    // "@@" then the marker word, ended by "@@", a control token, or whitespace.
    const m = text.match(/^@@\s*([^\s@<|]*)/);
    const word = m?.[1] ?? "";
    const after = text.slice(m ? m[0].length : 0);
    const complete = after.length > 0 || word.length > 24;
    if (!complete) return { kind: null, rest: "", resolved: false };

    let rest = after.replace(/^@{1,2}/, "");
    // Trailing control tokens after the marker ("@@Ask<|message|>").
    rest = rest.replace(/^(?:\s*<\|[a-z_]{1,24}\|>(?:final|analysis|commentary)?)+/i, "");
    // A control token still arriving right after the marker.
    if (/^<\|?[a-z_]{0,24}\|?$/i.test(rest)) return { kind: null, rest: "", resolved: false };
    return { kind: classify(word), rest: rest.replace(/^\s*\n/, ""), resolved: true };
  }

  // Enough characters have arrived that this cannot still turn into a
  // recognised marker — stop waiting and show everything received.
  if (text.length >= MAX_MARKER_PROBE_LENGTH || (text.length > 0 && !text.startsWith("@"))) {
    return { kind: "report", rest: stripControlTokens(buffer), resolved: true };
  }

  // Still ambiguous — could be the start of either marker. Caller
  // should hold rendering and wait for more text.
  return { kind: null, rest: "", resolved: false };
}
