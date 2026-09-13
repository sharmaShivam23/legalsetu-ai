// ==========================================================
// LegalSetu — Small-talk detection
// ----------------------------------------------------------
// Typing "hi" was returning a full legal action plan with
// statute citations attached. That is not just odd, it is
// actively bad: it buries a first-time user in legislation
// before they have said what they need, and it attaches
// official sources to a message that made no legal claim.
//
// A greeting should get a greeting. This module decides that,
// and the route then skips retrieval entirely — which also
// makes the reply near-instant instead of a full RAG round
// trip for the word "hi".
//
// Deliberately conservative: only very short messages qualify,
// so "hi, my landlord kept my deposit" is treated as the real
// legal question it is, not as a greeting.
// ==========================================================

/** Greetings, thanks and sign-offs across the languages LegalSetu serves. */
const SMALL_TALK_PATTERNS: RegExp[] = [
  // English greetings, including drawn-out spellings like "hiii".
  /^(hi+|hey+|he+llo+|yo|hola|greetings|good\s*(morning|afternoon|evening|day))$/i,
  // Hindi / Urdu / Punjabi / Marathi / Bengali greetings, in both scripts.
  /^(namaste|namaskar|salaam|salam|assalam[\s-]*u[\s-]*alaikum|sat\s*sri\s*akal|vanakkam|adaab)$/i,
  /^(नमस्ते|नमस्कार|प्रणाम|सलाम|आदाब|हैलो|हाय|ਸਤ\s*ਸ੍ਰੀ\s*ਅਕਾਲ|নমস্কার|வணக்கம்)$/,
  // Thanks and sign-offs.
  /^(thanks|thank\s*you|thx|ty|dhanyavad|dhanyawad|shukriya|धन्यवाद|शुक्रिया)$/i,
  /^(bye|goodbye|see\s*you|ok|okay|k|cool|nice|great|good|fine)$/i,
  // "are you there", "test", and similar pokes at the box.
  /^(test|testing|hello\s*there|are\s*you\s*there|you\s*there|who\s*are\s*you|what\s*can\s*you\s*do)\??$/i,
];

/** Longer than this and we assume there is a real question in there. */
const MAX_SMALL_TALK_CHARS = 40;

/**
 * True when the message is a greeting or pleasantry rather than a
 * request for legal information.
 */
export function isSmallTalk(text: string): boolean {
  const trimmed = text
    .trim()
    // Strip trailing punctuation/emoji-ish noise: "hi!!!" -> "hi"
    .replace(/[!.…,~\s]+$/u, "")
    .trim();

  if (!trimmed) return true;
  if (trimmed.length > MAX_SMALL_TALK_CHARS) return false;

  // More than four words is very unlikely to be a bare greeting.
  if (trimmed.split(/\s+/).length > 4) return false;

  return SMALL_TALK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * System prompt for a greeting. No headings, no citations, no
 * disclaimer — just a warm, short reply that invites the user to
 * say what they actually need.
 */
export function buildSmallTalkPrompt(languageDirective: string): string {
  return `You are LegalSetu, a friendly AI legal-information assistant for India.

The user has sent a greeting or a pleasantry, NOT a legal question.

Reply the way a helpful person would:
- Two or three short sentences, maximum. Warm and human.
- Greet them back, say in one line what you can help with (understanding a legal problem, what to do next, or explaining a law).
- Invite them to describe their situation in their own words.

STRICTLY FORBIDDEN in this reply:
- Do NOT use any markdown headings (no "## Answer", no "## Do this now").
- Do NOT cite any Act, section number, or legal provision.
- Do NOT produce a table, a flowchart, or an action plan.
- Do NOT add a legal disclaimer.
- Do NOT invent a legal problem the user has not described.

Just be a person saying hello.${languageDirective}`;
}
